"""Admin proctoring routes.

Provides endpoints for admins to:
  - List all proctoring sessions with filtering/pagination
  - Get a proctoring summary for an attempt
  - Export proctoring events as CSV
  - Get aggregate stats across attempts for a test
  - Live monitoring: watch active proctoring sessions in real time
"""
from __future__ import annotations

import asyncio
import contextlib
import csv
import io
import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from sqlalchemy import func, case, and_
from starlette.websockets import WebSocketState
from sqlalchemy.orm import Session, subqueryload

from ...api.deps import get_current_user, get_db_dep, require_permission
from ...models import (
    Attempt,
    AttemptStatus,
    Exam,
    ProctoringEvent,
    RoleEnum,
    SeverityEnum,
    User,
)
from ...schemas import PaginatedResponse, ProctoringEventRead
from ...utils.pagination import MAX_PAGE_SIZE, normalize_pagination

router = APIRouter()
logger = logging.getLogger(__name__)


class ProctoringSessionSummary:
    """Lightweight DTO built manually (not a Pydantic response_model)."""
    pass


@router.get("/admin/sessions")
async def list_proctoring_sessions(
    exam_id: UUID | None = None,
    user_id: UUID | None = None,
    min_risk: int | None = Query(None, ge=0, le=100),
    severity: str | None = Query(None, description="Filter by max severity: HIGH, MEDIUM, LOW"),
    status: str | None = Query(None, description="Attempt status filter"),
    sort_by: str | None = Query("started_at", description="Sort field"),
    sort_dir: str | None = Query("desc"),
    page: int | None = Query(1, ge=1),
    page_size: int | None = Query(20, ge=1, le=MAX_PAGE_SIZE),
    current: User = Depends(require_permission("proctoring.admin", RoleEnum.ADMIN)),
    db: Session = Depends(get_db_dep),
):
    """List proctoring sessions with event summaries, filterable by exam/user/severity."""
    pag = normalize_pagination(page=page, page_size=page_size)
    offset, limit = pag.offset, pag.limit

    # Base query: attempts that have at least one proctoring event
    q = db.query(Attempt).options(
        subqueryload(Attempt.user),
        subqueryload(Attempt.exam),
    )

    if exam_id:
        q = q.filter(Attempt.exam_id == exam_id)
    if user_id:
        q = q.filter(Attempt.user_id == user_id)
    if status:
        try:
            q = q.filter(Attempt.status == AttemptStatus(status.upper()))
        except ValueError:
            pass

    # Count events per attempt via subquery
    event_counts_sq = (
        db.query(
            ProctoringEvent.attempt_id,
            func.count(ProctoringEvent.id).label("total_events"),
            func.count(case((ProctoringEvent.severity == SeverityEnum.HIGH, 1))).label("high_count"),
            func.count(case((ProctoringEvent.severity == SeverityEnum.MEDIUM, 1))).label("medium_count"),
            func.count(case((ProctoringEvent.severity == SeverityEnum.LOW, 1))).label("low_count"),
        )
        .group_by(ProctoringEvent.attempt_id)
        .subquery()
    )

    q = q.outerjoin(event_counts_sq, Attempt.id == event_counts_sq.c.attempt_id)

    # Only include attempts that have events (proctored attempts)
    q = q.filter(event_counts_sq.c.total_events > 0)

    if severity:
        sev_upper = severity.upper()
        if sev_upper == "HIGH":
            q = q.filter(event_counts_sq.c.high_count > 0)
        elif sev_upper == "MEDIUM":
            q = q.filter((event_counts_sq.c.high_count > 0) | (event_counts_sq.c.medium_count > 0))

    # Filter by minimum risk score in SQL so pagination is accurate
    if min_risk is not None:
        risk_expr = (
            func.coalesce(event_counts_sq.c.high_count, 0) * 3
            + func.coalesce(event_counts_sq.c.medium_count, 0) * 2
            + func.coalesce(event_counts_sq.c.low_count, 0)
        )
        q = q.filter(risk_expr >= min_risk)

    total = q.count()

    # Sorting
    sort_col = {
        "started_at": Attempt.started_at,
        "submitted_at": Attempt.submitted_at,
        "total_events": event_counts_sq.c.total_events,
        "high_count": event_counts_sq.c.high_count,
    }.get(sort_by, Attempt.started_at)
    if sort_dir and sort_dir.lower() == "asc":
        q = q.order_by(sort_col.asc().nullslast())
    else:
        q = q.order_by(sort_col.desc().nullslast())

    rows = q.add_columns(
        event_counts_sq.c.total_events,
        event_counts_sq.c.high_count,
        event_counts_sq.c.medium_count,
        event_counts_sq.c.low_count,
    ).offset(offset).limit(limit).all()

    items = []
    for attempt, total_events, high, medium, low in rows:
        risk_score = (high or 0) * 3 + (medium or 0) * 2 + (low or 0)
        items.append({
            "attempt_id": str(attempt.id),
            "exam_id": str(attempt.exam_id),
            "exam_title": attempt.exam.title if attempt.exam else None,
            "user_id": str(attempt.user_id),
            "user_name": attempt.user.name if attempt.user else None,
            "student_id": attempt.user.user_id if attempt.user else None,
            "status": attempt.status.value if attempt.status else None,
            "score": attempt.score,
            "started_at": attempt.started_at.isoformat() if attempt.started_at else None,
            "submitted_at": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
            "identity_verified": attempt.identity_verified,
            "total_events": total_events or 0,
            "high_severity": high or 0,
            "medium_severity": medium or 0,
            "low_severity": low or 0,
            "risk_score": risk_score,
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/admin/sessions/{attempt_id}/summary")
async def get_session_summary(
    attempt_id: str,
    current: User = Depends(require_permission("proctoring.admin", RoleEnum.ADMIN)),
    db: Session = Depends(get_db_dep),
):
    """Get detailed proctoring summary for a single attempt."""
    from ...api.deps import parse_uuid_param
    pk = parse_uuid_param(attempt_id)
    attempt = db.get(Attempt, pk)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    events = (
        db.query(ProctoringEvent)
        .filter(ProctoringEvent.attempt_id == pk)
        .order_by(ProctoringEvent.occurred_at.asc())
        .all()
    )

    # Build summary
    event_type_counts: dict[str, int] = {}
    severity_counts = {"HIGH": 0, "MEDIUM": 0, "LOW": 0}
    timeline = []
    for ev in events:
        et = ev.event_type or "UNKNOWN"
        event_type_counts[et] = event_type_counts.get(et, 0) + 1
        sev = ev.severity.value if ev.severity else "LOW"
        severity_counts[sev] = severity_counts.get(sev, 0) + 1
        timeline.append({
            "id": str(ev.id),
            "event_type": et,
            "severity": sev,
            "detail": ev.detail,
            "confidence": ev.ai_confidence,
            "occurred_at": ev.occurred_at.isoformat() if ev.occurred_at else None,
            "meta": ev.meta,
        })

    risk_score = severity_counts["HIGH"] * 3 + severity_counts["MEDIUM"] * 2 + severity_counts["LOW"]

    # Duration
    duration_sec = None
    if attempt.started_at and attempt.submitted_at:
        duration_sec = (attempt.submitted_at - attempt.started_at).total_seconds()

    return {
        "attempt_id": str(attempt.id),
        "status": attempt.status.value if attempt.status else None,
        "score": attempt.score,
        "started_at": attempt.started_at.isoformat() if attempt.started_at else None,
        "submitted_at": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
        "duration_seconds": duration_sec,
        "identity_verified": attempt.identity_verified,
        "total_events": len(events),
        "severity_counts": severity_counts,
        "event_type_counts": event_type_counts,
        "risk_score": risk_score,
        "timeline": timeline,
    }


@router.get("/admin/sessions/{attempt_id}/export")
async def export_session_events(
    attempt_id: str,
    current: User = Depends(require_permission("proctoring.admin", RoleEnum.ADMIN)),
    db: Session = Depends(get_db_dep),
):
    """Export proctoring events for an attempt as CSV."""
    from ...api.deps import parse_uuid_param
    pk = parse_uuid_param(attempt_id)
    attempt = db.get(Attempt, pk)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    events = (
        db.query(ProctoringEvent)
        .filter(ProctoringEvent.attempt_id == pk)
        .order_by(ProctoringEvent.occurred_at.asc())
        .all()
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["timestamp", "event_type", "severity", "detail", "confidence", "meta"])
    for ev in events:
        writer.writerow([
            ev.occurred_at.isoformat() if ev.occurred_at else "",
            ev.event_type,
            ev.severity.value if ev.severity else "",
            ev.detail or "",
            ev.ai_confidence or "",
            str(ev.meta) if ev.meta else "",
        ])

    output.seek(0)
    filename = f"proctoring_events_{attempt_id[:8]}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/admin/stats/{exam_id}")
async def get_exam_proctoring_stats(
    exam_id: str,
    current: User = Depends(require_permission("proctoring.admin", RoleEnum.ADMIN)),
    db: Session = Depends(get_db_dep),
):
    """Get aggregate proctoring statistics for all attempts of a given exam."""
    from ...api.deps import parse_uuid_param
    exam_pk = parse_uuid_param(exam_id)

    # All attempts for this exam
    attempts = (
        db.query(Attempt)
        .filter(Attempt.exam_id == exam_pk)
        .all()
    )
    if not attempts:
        return {
            "exam_id": exam_id,
            "total_attempts": 0,
            "proctored_attempts": 0,
            "avg_risk_score": 0,
            "flagged_attempts": 0,
            "event_type_totals": {},
            "severity_totals": {"HIGH": 0, "MEDIUM": 0, "LOW": 0},
        }

    attempt_ids = [a.id for a in attempts]

    # Aggregate events
    rows = (
        db.query(
            ProctoringEvent.event_type,
            ProctoringEvent.severity,
            func.count(ProctoringEvent.id),
        )
        .filter(ProctoringEvent.attempt_id.in_(attempt_ids))
        .group_by(ProctoringEvent.event_type, ProctoringEvent.severity)
        .all()
    )

    event_type_totals: dict[str, int] = {}
    severity_totals = {"HIGH": 0, "MEDIUM": 0, "LOW": 0}
    for et, sev, cnt in rows:
        event_type_totals[et] = event_type_totals.get(et, 0) + cnt
        sev_str = sev.value if sev else "LOW"
        severity_totals[sev_str] = severity_totals.get(sev_str, 0) + cnt

    # Per-attempt risk scores
    per_attempt = (
        db.query(
            ProctoringEvent.attempt_id,
            func.count(case((ProctoringEvent.severity == SeverityEnum.HIGH, 1))).label("high"),
            func.count(case((ProctoringEvent.severity == SeverityEnum.MEDIUM, 1))).label("medium"),
            func.count(case((ProctoringEvent.severity == SeverityEnum.LOW, 1))).label("low"),
        )
        .filter(ProctoringEvent.attempt_id.in_(attempt_ids))
        .group_by(ProctoringEvent.attempt_id)
        .all()
    )

    risk_scores = [h * 3 + m * 2 + lo for _, h, m, lo in per_attempt]
    proctored = len(per_attempt)
    avg_risk = round(sum(risk_scores) / max(1, proctored), 1)
    flagged = sum(1 for s in risk_scores if s >= 10)

    return {
        "exam_id": exam_id,
        "total_attempts": len(attempts),
        "proctored_attempts": proctored,
        "avg_risk_score": avg_risk,
        "flagged_attempts": flagged,
        "event_type_totals": event_type_totals,
        "severity_totals": severity_totals,
    }


@router.get("/admin/config-history/{exam_id}")
async def get_proctoring_config_history(
    exam_id: str,
    current: User = Depends(require_permission("proctoring.admin", RoleEnum.ADMIN)),
    db: Session = Depends(get_db_dep),
):
    """Get the audit trail of proctoring config changes for a test."""
    from ...api.deps import parse_uuid_param
    from ...models import AuditLog
    pk = parse_uuid_param(exam_id)

    logs = (
        db.query(AuditLog)
        .filter(
            AuditLog.resource_type == "test",
            AuditLog.resource_id == str(pk),
            AuditLog.action == "PROCTORING_CONFIG_UPDATED",
        )
        .order_by(AuditLog.created_at.desc())
        .limit(50)
        .all()
    )

    return {
        "exam_id": exam_id,
        "changes": [
            {
                "id": str(log.id),
                "changed_by": str(log.user_id) if log.user_id else None,
                "detail": log.detail,
                "ip_address": log.ip_address,
                "changed_at": log.created_at.isoformat() if log.created_at else None,
            }
            for log in logs
        ],
    }


# ── Force Submit ──────────────────────────────────────────────────────────────

@router.post("/admin/sessions/{attempt_id}/force-submit")
async def force_submit_attempt(
    attempt_id: str,
    current: User = Depends(require_permission("proctoring.admin", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR)),
    db: Session = Depends(get_db_dep),
):
    """Force-submit a learner's attempt. Admin can force any; instructor only their own exams."""
    from ...api.deps import parse_uuid_param
    from .routes_public import _auto_submit_attempt, _broadcast_to_viewers

    pk = parse_uuid_param(attempt_id)
    attempt = db.get(Attempt, pk)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    # Instructor can only force-submit attempts for exams they created
    if current.role == RoleEnum.INSTRUCTOR:
        exam = db.get(Exam, attempt.exam_id)
        if not exam or exam.created_by_id != current.id:
            raise HTTPException(status_code=403, detail="Not allowed")

    if attempt.status == AttemptStatus.SUBMITTED:
        raise HTTPException(status_code=409, detail="Attempt already submitted")

    _auto_submit_attempt(
        db,
        attempt,
        violation_count=0,
        reason=f"Force-submitted by admin {current.name or current.id}",
        actor_user_id=current.id,
    )

    # Notify live viewers that the session was force-submitted
    await _broadcast_to_viewers(str(pk), {
        "type": "force_submitted",
        "detail": "Attempt was force-submitted by an administrator.",
    })

    return {"detail": "Attempt force-submitted", "attempt_id": str(pk)}


# ── Live Monitoring ───────────────────────────────────────────────────────────

@router.get("/admin/live")
async def list_active_sessions(
    current: User = Depends(require_permission("proctoring.admin", RoleEnum.ADMIN)),
):
    """List all currently active proctoring sessions (learners with an open WS)."""
    from .routes_public import _live_session_info, _live_viewers

    sessions = []
    for attempt_id, info in _live_session_info.items():
        viewers_count = len(_live_viewers.get(attempt_id, set()))
        sessions.append({
            **info,
            "viewers": viewers_count,
        })
    return {"active_sessions": sessions}


@router.websocket("/admin/live/{attempt_id}/ws")
async def live_monitor_ws(websocket: WebSocket, attempt_id: str, token: str):
    """Admin WebSocket: watch a learner's proctoring session in real time.

    Receives:
      - Binary messages: frame thumbnails (type byte + JPEG data)
      - JSON messages: alerts, summaries, session_ended
    """
    from ...core.security import verify_token
    from .routes_public import _live_viewers, _live_session_info, _live_latest_thumb

    # Authenticate admin
    try:
        payload = verify_token(token, expected_type="access")
    except Exception:
        await websocket.close(code=4401)
        return
    if payload.get("role") not in {"ADMIN", "INSTRUCTOR"}:
        await websocket.close(code=4403)
        return

    # Instructor ownership check: only allow viewing sessions for their own exams
    if payload.get("role") == "INSTRUCTOR":
        session_info_check = _live_session_info.get(attempt_id)
        if session_info_check:
            from ...db.session import get_db
            db_gen = get_db()
            db = next(db_gen)
            try:
                exam = db.get(Exam, session_info_check.get("exam_id"))
                if not exam or str(exam.created_by_id) != payload.get("sub"):
                    await websocket.close(code=4403)
                    return
            finally:
                try:
                    next(db_gen)
                except StopIteration:
                    pass

    await websocket.accept()

    # Check if session is active
    session_info = _live_session_info.get(attempt_id)
    if not session_info:
        await websocket.send_json({"type": "error", "detail": "Session not active or not found"})
        await websocket.close(code=4404)
        return

    # Register this viewer
    if attempt_id not in _live_viewers:
        _live_viewers[attempt_id] = set()
    _live_viewers[attempt_id].add(websocket)

    await websocket.send_json({"type": "connected", **session_info})

    # Send last known thumbnail if available
    thumb = _live_latest_thumb.get(attempt_id)
    if thumb:
        try:
            await websocket.send_bytes(b'\x01' + thumb)
        except Exception:
            pass

    try:
        # Keep alive — just consume any messages from admin (e.g., keepalives)
        while True:
            try:
                data = await websocket.receive_json()
                # Admin can send commands in the future (e.g., send warning to student)
                msg_type = data.get("type", "")
                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})
            except WebSocketDisconnect:
                break
            except Exception:
                break
    finally:
        viewers = _live_viewers.get(attempt_id)
        if viewers:
            viewers.discard(websocket)
        if websocket.application_state == WebSocketState.CONNECTED:
            with contextlib.suppress(Exception):
                await websocket.close(code=1000)
