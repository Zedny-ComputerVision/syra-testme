import base64
import asyncio
import contextlib
import json
import logging
import time
from collections.abc import Mapping
from datetime import datetime, timedelta, timezone
from pathlib import Path
import shutil
from uuid import uuid4

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from starlette.websockets import WebSocketState
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...api.deps import ensure_permission, get_current_user, get_db_dep, require_permission, parse_uuid_param
from ...core.security import verify_token
from ...core.config import get_settings
from ...models import Attempt, Notification, ProctoringEvent, SeverityEnum, RoleEnum, AttemptStatus, SystemSettings, User
from ...schemas import ProctoringEventRead, Message, ProctoringPingResponse
from ...detection.orchestrator import ProctoringOrchestrator
from ...reporting.report_generator import generate_html_report
from ...services.integrations import send_proctoring_integration_event
from ...services.audit import write_audit_log
from ...services.notifications import notify_proctoring_event, notify_user
from ...modules.tests.proctoring_requirements import get_proctoring_requirements

router = APIRouter()
BASE_STORAGE_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent / "storage"
EVIDENCE_DIR = BASE_STORAGE_DIR / "evidence"
VIDEO_DIR = BASE_STORAGE_DIR / "videos"
VIDEO_CHUNKS_DIR = BASE_STORAGE_DIR / "video_chunks"
MAX_VIDEO_CHUNK_BYTES = 5 * 1024 * 1024
MAX_VIDEO_CAPTURE_BYTES = 500 * 1024 * 1024
HEARTBEAT_INTERVAL_SECONDS = 30
INACTIVITY_TIMEOUT_SECONDS = 60
ADMIN_PROCTORING_NOTIFICATION_WINDOW = timedelta(minutes=5)
logger = logging.getLogger(__name__)

SEVERITY_MAP = {
    "CRITICAL": SeverityEnum.HIGH,
    "HIGH": SeverityEnum.HIGH,
    "MEDIUM": SeverityEnum.MEDIUM,
    "LOW": SeverityEnum.LOW,
}
settings = get_settings()


def _validate_video_content_type(content_type: str | None) -> None:
    normalized = (content_type or "").lower()
    if normalized.startswith("video/") or normalized == "application/octet-stream":
        return
    raise HTTPException(
        status_code=415,
        detail="Invalid video chunk content type. Expected video/* or application/octet-stream.",
    )


def _combined_chunk_size(chunk_dir: Path) -> int:
    return sum(path.stat().st_size for path in chunk_dir.glob("*.part") if path.is_file())


def _load_integrations_config(db: Session) -> dict:
    config_row = db.scalar(select(SystemSettings).where(SystemSettings.key == "integrations_config"))
    if not config_row or not config_row.value:
        return {}
    try:
        return json.loads(config_row.value)
    except Exception:
        return {}


def _save_evidence(attempt_id: str, frame_bytes: bytes, event_type: str) -> str | None:
    """Save screenshot evidence for HIGH severity events."""
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
    filename = f"{attempt_id}_{event_type}_{ts}.jpg"
    filepath = EVIDENCE_DIR / filename
    filepath.write_bytes(frame_bytes)
    return f"/api/media/evidence/{filename}"


def _attempt_or_forbidden(attempt_id: str, db: Session, current):
    attempt_pk = parse_uuid_param(attempt_id, detail="Attempt not found")
    attempt = db.get(Attempt, attempt_pk)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if current.role == RoleEnum.LEARNER and attempt.user_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")
    if current.role != RoleEnum.LEARNER:
        ensure_permission(db, current, "View Attempt Analysis")
    return attempt


def _event_label(event_type: str) -> str:
    return str(event_type or "alert").replace("_", " ").title()


def _action_label(action: str) -> str:
    labels = {
        "FLAG_REVIEW": "Flag for review",
        "WARN": "Warn learner",
        "AUTO_SUBMIT": "Auto-submit exam",
    }
    return labels.get(str(action or "").upper(), "Warn learner")


def _client_ip(client) -> str | None:
    return getattr(client, "host", None) if client else None


def _is_serious_alert(raw_severity: str | None, severity: SeverityEnum) -> bool:
    return str(raw_severity or getattr(severity, "value", severity) or "").upper() in {"HIGH", "CRITICAL"}


def _notify_admin_monitors_for_event(db: Session, attempt: Attempt, event: ProctoringEvent) -> None:
    occurred_at = event.occurred_at or datetime.now(timezone.utc)
    event_type = event.event_type or "UNKNOWN"
    exam_title = attempt.exam.title if attempt.exam else "Exam"
    link = f"/admin/attempt-analysis?id={attempt.id}"
    title = f"Proctoring Alert: {_event_label(event_type)}"
    message = f"High-severity proctoring event on '{exam_title}': {event.detail or _event_label(event_type)}"
    logger.warning("High-severity proctoring event for attempt %s: %s", attempt.id, message)
    admin_ids = db.scalars(select(User.id).where(User.role == RoleEnum.ADMIN)).all()
    for admin_id in admin_ids:
        existing = db.scalar(
            select(Notification.id)
            .where(
                Notification.user_id == admin_id,
                Notification.title == title,
                Notification.link == link,
                Notification.created_at >= occurred_at - ADMIN_PROCTORING_NOTIFICATION_WINDOW,
            )
            .limit(1)
        )
        if existing:
            continue
        notify_user(db, admin_id, title, message, link)


def _handle_serious_proctoring_event(db: Session, attempt: Attempt, event: ProctoringEvent) -> None:
    if event.severity != SeverityEnum.HIGH:
        return
    notify_proctoring_event(
        db,
        attempt.id,
        {
            "event_type": event.event_type,
            "detail": event.detail or "A proctoring event was detected.",
        },
    )
    _notify_admin_monitors_for_event(db, attempt, event)


def _auto_submit_attempt(
    db: Session,
    attempt: Attempt,
    *,
    violation_count: int,
    reason: str,
    occurred_at: datetime | None = None,
    actor_user_id=None,
    request_ip: str | None = None,
) -> None:
    timestamp = occurred_at or datetime.now(timezone.utc)
    if attempt.status != AttemptStatus.SUBMITTED:
        attempt.status = AttemptStatus.SUBMITTED
        attempt.submitted_at = timestamp
        db.add(attempt)
        db.commit()
    exam_title = attempt.exam.title if attempt.exam else "Exam"
    notify_user(
        db,
        attempt.user_id,
        "Exam Auto-Submitted",
        f"Your attempt for '{exam_title}' was auto-submitted due to multiple proctoring violations.",
        f"/attempts/{attempt.id}",
    )
    try:
        write_audit_log(
            db,
            actor_user_id,
            "ATTEMPT_AUTO_SUBMITTED",
            "attempt",
            str(attempt.id),
            f"Auto-submitted due to {violation_count} violations. {reason}".strip(),
            request_ip,
        )
    except Exception as exc:
        logger.warning("Failed to write auto-submit audit log for attempt %s: %s", attempt.id, exc)


def _load_attempt_events(db: Session, attempt_id) -> list[ProctoringEvent]:
    return db.scalars(
        select(ProctoringEvent)
        .where(ProctoringEvent.attempt_id == attempt_id)
        .order_by(ProctoringEvent.occurred_at)
    ).all()


def _latest_event_of_type(events: list[ProctoringEvent], event_type: str) -> ProctoringEvent | None:
    for event in reversed(events):
        if event.event_type == event_type:
            return event
    return None


def _rule_already_triggered(events: list[ProctoringEvent], rule_id: str) -> bool:
    for event in reversed(events):
        meta = event.meta if isinstance(event.meta, Mapping) else {}
        if event.event_type == "ALERT_RULE_TRIGGERED" and meta.get("rule_id") == rule_id:
            return True
    return False


def _build_rule_detail(rule: Mapping[str, object], event_type: str, actual_count: int) -> str:
    message = rule.get("message")
    if isinstance(message, str) and message.strip():
        return message.strip()
    return (
        f"{_event_label(event_type)} reached {actual_count} occurrence(s). "
        f"Action: {_action_label(str(rule.get('action') or 'WARN'))}."
    )


def _apply_alert_rules(
    db: Session,
    attempt: Attempt,
    exam_cfg: Mapping[str, object] | None,
    source_event: ProctoringEvent,
    history_events: list[ProctoringEvent],
    occurred_at: datetime,
    *,
    actor_user_id=None,
    request_ip: str | None = None,
) -> dict[str, object]:
    rules = exam_cfg.get("alert_rules") if isinstance(exam_cfg, Mapping) else []
    if attempt.status != AttemptStatus.IN_PROGRESS or not isinstance(rules, list):
        return {"alerts": [], "forced_submit": False, "submit_reason": None, "created_events": []}

    matching_count = sum(1 for event in history_events if event.event_type == source_event.event_type)
    alerts: list[dict[str, object]] = []
    created_events: list[ProctoringEvent] = []
    forced_submit = False
    submit_reason = None

    for rule in rules:
        if not isinstance(rule, Mapping):
            continue
        if str(rule.get("event_type") or "").upper() != source_event.event_type:
            continue
        threshold = max(1, int(rule.get("threshold") or 1))
        rule_id = str(rule.get("id") or f"{source_event.event_type}-{threshold}")
        if matching_count < threshold or _rule_already_triggered(history_events, rule_id):
            continue

        action = str(rule.get("action") or "WARN").upper()
        severity_name = str(rule.get("severity") or "MEDIUM").upper()
        severity = SeverityEnum(severity_name if severity_name in {"LOW", "MEDIUM", "HIGH"} else "MEDIUM")
        detail = _build_rule_detail(rule, source_event.event_type, matching_count)
        escalation_event = ProctoringEvent(
            attempt_id=attempt.id,
            event_type="ALERT_RULE_TRIGGERED",
            severity=severity,
            detail=detail,
            meta={
                "source": "alert_rule",
                "rule_id": rule_id,
                "rule_action": action,
                "trigger_event_type": source_event.event_type,
                "threshold": threshold,
                "actual_count": matching_count,
            },
            occurred_at=occurred_at,
        )
        db.add(escalation_event)
        history_events.append(escalation_event)
        created_events.append(escalation_event)

        if action in {"WARN", "AUTO_SUBMIT"}:
            alerts.append({
                "event_type": source_event.event_type,
                "severity": severity,
                "detail": detail,
                "action": action,
                "rule_id": rule_id,
                "threshold": threshold,
                "actual_count": matching_count,
            })

        if action == "AUTO_SUBMIT" and attempt.status == AttemptStatus.IN_PROGRESS:
            _auto_submit_attempt(
                db,
                attempt,
                violation_count=matching_count,
                reason=detail,
                occurred_at=occurred_at,
                actor_user_id=actor_user_id,
                request_ip=request_ip,
            )
            forced_submit = True
            submit_reason = detail
            break

    return {
        "alerts": alerts,
        "forced_submit": forced_submit,
        "submit_reason": submit_reason,
        "created_events": created_events,
    }


@router.post("/{attempt_id}/ping", response_model=ProctoringPingResponse)
async def proctoring_ping(
    attempt_id: str,
    request: Request,
    payload: dict = Body(...),
    db: Session = Depends(get_db_dep),
    current=Depends(get_current_user),
):
    attempt = _attempt_or_forbidden(attempt_id, db, current)
    focus = payload.get("focus", True)
    visibility = payload.get("visibility", "visible")
    blurs = payload.get("blurs", 0)
    fullscreen = payload.get("fullscreen", True)
    camera_dark = bool(payload.get("camera_dark"))
    events = []
    if not focus or visibility != "visible":
        events.append(("FOCUS_LOSS", SeverityEnum.MEDIUM))
    if not fullscreen:
        events.append(("FULLSCREEN_EXIT", SeverityEnum.HIGH))
    if camera_dark:
        events.append(("CAMERA_COVERED", SeverityEnum.HIGH))

    now = datetime.now(timezone.utc)
    history_events = _load_attempt_events(db, attempt.id)
    response_alerts: list[dict[str, object]] = []
    created_events: list[ProctoringEvent] = []
    forced_submit = False
    submit_reason = None
    for etype, sev in events:
        recent_same = _latest_event_of_type(history_events, etype)
        if recent_same and recent_same.occurred_at:
            try:
                if (now - recent_same.occurred_at).total_seconds() < 8:
                    continue
            except (AttributeError, TypeError):
                pass
            except Exception as exc:
                logger.warning("Unexpected error in proctoring event dedup: %s", exc)
        ev = ProctoringEvent(
            attempt_id=attempt_id,
            event_type=etype,
            severity=sev,
            detail=f"focus={focus}, visibility={visibility}, blurs={blurs}, fullscreen={fullscreen}, camera_dark={camera_dark}",
            occurred_at=now,
        )
        db.add(ev)
        history_events.append(ev)
        created_events.append(ev)
        rule_result = _apply_alert_rules(
            db,
            attempt,
            attempt.exam.proctoring_config if attempt.exam else {},
            ev,
            history_events,
            now,
            actor_user_id=current.id,
            request_ip=_client_ip(request.client if request else None),
        )
        response_alerts.extend(rule_result["alerts"])
        created_events.extend(rule_result["created_events"])
        if rule_result["forced_submit"]:
            forced_submit = True
            submit_reason = rule_result["submit_reason"]
            break
    db.commit()
    for event in created_events:
        _handle_serious_proctoring_event(db, attempt, event)
    return {
        "detail": "ok",
        "alerts": response_alerts,
        "forced_submit": forced_submit,
        "submit_reason": submit_reason,
    }


@router.post("/{attempt_id}/video/start")
async def start_video_capture(
    attempt_id: str,
    payload: dict = Body(default={}),
    db: Session = Depends(get_db_dep),
    current=Depends(get_current_user),
):
    _attempt_or_forbidden(attempt_id, db, current)
    mime_type = (payload or {}).get("mime_type") or "video/webm"
    session_id = uuid4().hex
    chunk_dir = VIDEO_CHUNKS_DIR / attempt_id / session_id
    chunk_dir.mkdir(parents=True, exist_ok=True)
    meta = {
        "attempt_id": attempt_id,
        "session_id": session_id,
        "mime_type": mime_type,
        "started_at": datetime.now(timezone.utc).isoformat(),
    }
    (chunk_dir / "meta.json").write_text(json.dumps(meta))
    return {"detail": "started", "session_id": session_id}


@router.post("/{attempt_id}/video/chunk", response_model=Message)
async def upload_video_chunk(
    attempt_id: str,
    session_id: str = Form(...),
    chunk_index: int = Form(..., ge=0),
    chunk: UploadFile = File(...),
    db: Session = Depends(get_db_dep),
    current=Depends(get_current_user),
):
    _attempt_or_forbidden(attempt_id, db, current)
    chunk_dir = VIDEO_CHUNKS_DIR / attempt_id / session_id
    chunk_dir.mkdir(parents=True, exist_ok=True)
    _validate_video_content_type(chunk.content_type)
    content = await chunk.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty chunk")
    if len(content) > MAX_VIDEO_CHUNK_BYTES:
        raise HTTPException(status_code=413, detail="Video chunk exceeds the 5MB limit")
    part_path = chunk_dir / f"{chunk_index:08d}.part"
    previous_size = part_path.stat().st_size if part_path.exists() else 0
    projected_total = _combined_chunk_size(chunk_dir) - previous_size + len(content)
    if projected_total > MAX_VIDEO_CAPTURE_BYTES:
        raise HTTPException(status_code=413, detail="Combined video upload exceeds the 500MB limit")
    part_path.write_bytes(content)
    return Message(detail="chunk saved")


@router.post("/{attempt_id}/video/finalize")
async def finalize_video_capture(
    attempt_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db_dep),
    current=Depends(get_current_user),
):
    _attempt_or_forbidden(attempt_id, db, current)
    session_id = payload.get("session_id")
    extension = (payload.get("extension") or "webm").replace(".", "").lower()
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")
    if extension not in {"webm", "mp4", "mkv"}:
        raise HTTPException(status_code=400, detail="Unsupported extension")

    VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{attempt_id}_{session_id}.{extension}"
    output_path = VIDEO_DIR / filename
    chunk_dir = VIDEO_CHUNKS_DIR / attempt_id / session_id

    # Idempotency guard: if this session is already finalized, don't overwrite
    # the existing media file with late-arriving chunks.
    if output_path.exists():
        file_info = {
            "name": filename,
            "url": f"/api/media/videos/{filename}",
            "size": output_path.stat().st_size,
        }
        try:
            if chunk_dir.exists():
                shutil.rmtree(chunk_dir)
                parent = chunk_dir.parent
                if parent.exists() and not any(parent.iterdir()):
                    parent.rmdir()
        except Exception:
            pass
        return {"detail": "video already finalized", "file": file_info}

    if not chunk_dir.exists():
        raise HTTPException(status_code=404, detail="Video session not found")

    parts = sorted(chunk_dir.glob("*.part"))
    if not parts:
        # Chunks may still be arriving when finalize is called; allow a short grace period.
        for _ in range(8):
            await asyncio.sleep(0.25)
            parts = sorted(chunk_dir.glob("*.part"))
            if parts:
                break
    if not parts:
        raise HTTPException(status_code=404, detail="No chunks uploaded")
    if sum(part.stat().st_size for part in parts) > MAX_VIDEO_CAPTURE_BYTES:
        raise HTTPException(status_code=413, detail="Combined video upload exceeds the 500MB limit")

    with output_path.open("wb") as out:
        for part in parts:
            out.write(part.read_bytes())

    file_info = {
        "name": filename,
        "url": f"/api/media/videos/{filename}",
        "size": output_path.stat().st_size,
    }

    event = ProctoringEvent(
        attempt_id=attempt_id,
        event_type="VIDEO_SAVED",
        severity=SeverityEnum.LOW,
        detail="Proctoring video saved",
        meta=file_info,
        occurred_at=datetime.now(timezone.utc),
    )
    db.add(event)
    db.commit()

    try:
        shutil.rmtree(chunk_dir)
        parent = chunk_dir.parent
        if parent.exists() and not any(parent.iterdir()):
            parent.rmdir()
    except Exception:
        pass

    return {"detail": "video finalized", "file": file_info}


@router.post("/{attempt_id}/pause", response_model=Message)
async def pause_attempt(
    attempt_id: str,
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("View Attempt Analysis", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR)),
):
    attempt = _attempt_or_forbidden(attempt_id, db, current)
    if attempt.status != AttemptStatus.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="Only in-progress attempts can be paused")

    event = ProctoringEvent(
        attempt_id=attempt_id,
        event_type="ATTEMPT_PAUSED",
        severity=SeverityEnum.LOW,
        detail=f"Attempt paused by {current.user_id}",
        meta={"paused": True},
        occurred_at=datetime.now(timezone.utc),
    )
    db.add(event)
    db.commit()
    return Message(detail="Attempt paused")


@router.post("/{attempt_id}/resume", response_model=Message)
async def resume_attempt(
    attempt_id: str,
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("View Attempt Analysis", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR)),
):
    attempt = _attempt_or_forbidden(attempt_id, db, current)
    if attempt.status != AttemptStatus.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="Only in-progress attempts can be resumed")

    event = ProctoringEvent(
        attempt_id=attempt_id,
        event_type="ATTEMPT_RESUMED",
        severity=SeverityEnum.LOW,
        detail=f"Attempt resumed by {current.user_id}",
        meta={"paused": False},
        occurred_at=datetime.now(timezone.utc),
    )
    db.add(event)
    db.commit()
    return Message(detail="Attempt resumed")


@router.get("/{attempt_id}/videos")
async def list_videos(
    attempt_id: str,
    db: Session = Depends(get_db_dep),
    current=Depends(get_current_user),
):
    _attempt_or_forbidden(attempt_id, db, current)
    VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    prefix = f"{attempt_id}_"
    files = [p for p in VIDEO_DIR.glob(f"{prefix}*") if p.is_file()]
    files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    result = []
    for f in files:
        result.append({
            "name": f.name,
            "url": f"/api/media/videos/{f.name}",
            "size": f.stat().st_size,
            "created_at": datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc).isoformat(),
        })
    return result


@router.websocket("/{attempt_id}/ws")
async def proctoring_ws(websocket: WebSocket, attempt_id: str, token: str):
    try:
        payload = verify_token(token, expected_type="access")
    except Exception:
        await websocket.close(code=4401)
        return

    await websocket.accept()
    await websocket.send_json({"type": "connected"})

    # Get a DB session for writing events
    from ...db.session import SessionLocal
    db = SessionLocal()

    # load attempt/exam for thresholds
    try:
        attempt_pk = parse_uuid_param(attempt_id, detail="Attempt not found")
    except HTTPException:
        await websocket.close(code=4404)
        db.close()
        return
    attempt = db.get(Attempt, attempt_pk)
    if not attempt:
        await websocket.close(code=4404)
        db.close()
        return
    # Optional access check: learners can only access their own attempt
    user_id = payload.get("sub")
    if user_id and str(attempt.user_id) != str(user_id) and payload.get("role") == "LEARNER":
        await websocket.close(code=4403)
        db.close()
        return
    if payload.get("role") in {"ADMIN", "INSTRUCTOR"}:
        try:
            actor_pk = parse_uuid_param(user_id, detail="User not found", status_code=403)
            actor = db.get(User, actor_pk)
            if not actor:
                raise HTTPException(status_code=403, detail="Insufficient permissions")
            ensure_permission(db, actor, "View Attempt Analysis")
        except HTTPException:
            await websocket.close(code=4403)
            db.close()
            return
    proctoring_requirements = get_proctoring_requirements(attempt.exam.proctoring_config if attempt.exam else None)
    if (
        proctoring_requirements["identity_required"]
        and not attempt.precheck_passed_at
        and not settings.precheck_test_bypass_enabled
    ):
        await websocket.send_json({"type": "alert", "event_type": "PRECHECK_BYPASS_DENIED", "severity": "HIGH", "detail": "Pre-exam checks not completed"})
        await websocket.close(code=4403)
        db.close()
        return

    exam_cfg = attempt.exam.proctoring_config if attempt and attempt.exam else {}
    exam_cfg = exam_cfg.copy() if exam_cfg else {}
    if getattr(attempt, "face_signature", None):
        exam_cfg["face_signature"] = attempt.face_signature
    orchestrator = ProctoringOrchestrator(exam_cfg)
    last_activity = {"monotonic": time.monotonic()}

    async def heartbeat() -> None:
        while True:
            await asyncio.sleep(HEARTBEAT_INTERVAL_SECONDS)
            try:
                if websocket.application_state != WebSocketState.CONNECTED:
                    return
                idle_seconds = time.monotonic() - last_activity["monotonic"]
                if idle_seconds >= INACTIVITY_TIMEOUT_SECONDS:
                    logger.info("Closing inactive proctoring websocket for attempt %s after %.1fs", attempt_id, idle_seconds)
                    await websocket.close(code=1001)
                    return
                await websocket.send_json({"type": "ping"})
            except Exception:
                return

    heartbeat_task = asyncio.create_task(heartbeat())

    try:
        while True:
            try:
                data = await websocket.receive_json()
                last_activity["monotonic"] = time.monotonic()
            except WebSocketDisconnect:
                logger.info("Proctoring websocket disconnected for attempt %s", attempt_id)
                raise
            except Exception as exc:
                logger.warning("Malformed websocket message for attempt %s: %s", attempt_id, exc)
                if websocket.application_state == WebSocketState.CONNECTED:
                    await websocket.send_json({"type": "error", "detail": "Malformed websocket message"})
                continue

            try:
                msg_type = data.get("type")

                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})
                    continue
                if msg_type == "pong":
                    continue

                if msg_type == "frame":
                    b64 = data.get("data")
                    if not b64:
                        continue
                    frame_bytes = base64.b64decode(b64)
                    alerts = orchestrator.process_frame(frame_bytes)
                    history_events = _load_attempt_events(db, attempt.id)
                    integrations_config = _load_integrations_config(db)

                    for alert in alerts:
                        severity = SEVERITY_MAP.get(alert.get("severity", "LOW"), SeverityEnum.LOW)
                        meta = alert.get("meta") or {}

                        if _is_serious_alert(alert.get("severity"), severity):
                            evidence_path = _save_evidence(attempt_id, frame_bytes, alert["event_type"])
                            if evidence_path:
                                meta["evidence"] = evidence_path

                        event_time = datetime.now(timezone.utc)
                        event = ProctoringEvent(
                            attempt_id=attempt_id,
                            event_type=alert["event_type"],
                            severity=severity,
                            detail=alert.get("detail"),
                            ai_confidence=alert.get("confidence"),
                            meta=meta if meta else None,
                            occurred_at=event_time,
                        )
                        db.add(event)
                        history_events.append(event)
                        rule_result = _apply_alert_rules(
                            db,
                            attempt,
                            exam_cfg,
                            event,
                            history_events,
                            event_time,
                            request_ip=_client_ip(websocket.client),
                        )
                        db.commit()
                        if _is_serious_alert(alert.get("severity"), severity):
                            _handle_serious_proctoring_event(db, attempt, event)
                        for escalated_event in rule_result["created_events"]:
                            _handle_serious_proctoring_event(db, attempt, escalated_event)

                        try:
                            await send_proctoring_integration_event(event, integrations_config)
                        except Exception:
                            pass
                        for escalated_event in rule_result["created_events"]:
                            try:
                                await send_proctoring_integration_event(escalated_event, integrations_config)
                            except Exception:
                                pass

                        await websocket.send_json({
                            "type": "alert",
                            "event_type": alert["event_type"],
                            "severity": alert["severity"],
                            "detail": alert.get("detail", ""),
                            "confidence": alert.get("confidence", 0),
                        })
                        for rule_alert in rule_result["alerts"]:
                            await websocket.send_json({
                                "type": "alert",
                                "event_type": rule_alert["event_type"],
                                "severity": rule_alert["severity"].value,
                                "detail": rule_alert["detail"],
                                "action": rule_alert["action"],
                                "rule_id": rule_alert["rule_id"],
                            })
                        if rule_result["forced_submit"]:
                            await websocket.send_json({"type": "forced_submit", "detail": rule_result["submit_reason"] or ""})
                            break

                    summary = orchestrator.get_summary()
                    await websocket.send_json({"type": "summary", "precheck_passed": bool(attempt.precheck_passed_at), **summary})
                    if attempt.status == AttemptStatus.SUBMITTED:
                        break
                    max_auto = exam_cfg.get("max_alerts_before_autosubmit")
                    max_score = exam_cfg.get("max_score_before_autosubmit")
                    if (max_auto and orchestrator.alert_count >= max_auto) or (max_score and orchestrator.violation_score >= max_score):
                        reason = f"Auto-submitted due to {orchestrator.alert_count} violations"
                        _auto_submit_attempt(
                            db,
                            attempt,
                            violation_count=orchestrator.alert_count,
                            reason=reason,
                            occurred_at=datetime.now(timezone.utc),
                            request_ip=_client_ip(websocket.client),
                        )
                        await websocket.send_json({"type": "forced_submit", "detail": reason})
                        break
                    continue

                if msg_type == "audio":
                    b64 = data.get("data")
                    if not b64:
                        continue
                    audio_bytes = base64.b64decode(b64)
                    alerts = orchestrator.process_audio(audio_bytes)
                    history_events = _load_attempt_events(db, attempt.id)

                    for alert in alerts:
                        severity = SEVERITY_MAP.get(alert.get("severity", "LOW"), SeverityEnum.LOW)
                        event_time = datetime.now(timezone.utc)
                        event = ProctoringEvent(
                            attempt_id=attempt_id,
                            event_type=alert["event_type"],
                            severity=severity,
                            detail=alert.get("detail"),
                            ai_confidence=alert.get("confidence"),
                            meta=alert.get("meta"),
                            occurred_at=event_time,
                        )
                        db.add(event)
                        history_events.append(event)
                        rule_result = _apply_alert_rules(
                            db,
                            attempt,
                            exam_cfg,
                            event,
                            history_events,
                            event_time,
                            request_ip=_client_ip(websocket.client),
                        )
                        db.commit()
                        if _is_serious_alert(alert.get("severity"), severity):
                            _handle_serious_proctoring_event(db, attempt, event)
                        for escalated_event in rule_result["created_events"]:
                            _handle_serious_proctoring_event(db, attempt, escalated_event)

                        await websocket.send_json({
                            "type": "alert",
                            "event_type": alert["event_type"],
                            "severity": alert["severity"],
                            "detail": alert.get("detail", ""),
                            "confidence": alert.get("confidence", 0),
                        })
                        for rule_alert in rule_result["alerts"]:
                            await websocket.send_json({
                                "type": "alert",
                                "event_type": rule_alert["event_type"],
                                "severity": rule_alert["severity"].value,
                                "detail": rule_alert["detail"],
                                "action": rule_alert["action"],
                                "rule_id": rule_alert["rule_id"],
                            })
                        if rule_result["forced_submit"]:
                            await websocket.send_json({"type": "forced_submit", "detail": rule_result["submit_reason"] or ""})
                            break

                    summary = orchestrator.get_summary()
                    await websocket.send_json({"type": "summary", **summary})
                    if attempt.status == AttemptStatus.SUBMITTED:
                        break
                    max_auto = exam_cfg.get("max_alerts_before_autosubmit")
                    max_score = exam_cfg.get("max_score_before_autosubmit")
                    if (max_auto and orchestrator.alert_count >= max_auto) or (max_score and orchestrator.violation_score >= max_score):
                        reason = f"Auto-submitted due to {orchestrator.alert_count} violations"
                        _auto_submit_attempt(
                            db,
                            attempt,
                            violation_count=orchestrator.alert_count,
                            reason=reason,
                            occurred_at=datetime.now(timezone.utc),
                            request_ip=_client_ip(websocket.client),
                        )
                        await websocket.send_json({"type": "forced_submit", "detail": reason})
                        break
                    continue

                if msg_type == "screen":
                    b64 = data.get("data")
                    if not b64:
                        continue
                    frame_bytes = base64.b64decode(b64)
                    _save_evidence(attempt_id, frame_bytes, "SCREEN")
                    continue
            except Exception as exc:
                logger.warning("Failed to process websocket message for attempt %s: %s", attempt_id, exc)
                if websocket.application_state == WebSocketState.CONNECTED:
                    await websocket.send_json({"type": "error", "detail": "Failed to process message"})

    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("Unexpected proctoring websocket error for attempt %s", attempt_id)
        if websocket.application_state == WebSocketState.CONNECTED:
            await websocket.close(code=1011)
    finally:
        heartbeat_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await heartbeat_task
        db.close()


@router.get("/{attempt_id}/events", response_model=list[ProctoringEventRead])
async def list_events(
    attempt_id: str,
    db: Session = Depends(get_db_dep),
    current=Depends(get_current_user),
):
    attempt = _attempt_or_forbidden(attempt_id, db, current)
    events = db.scalars(
        select(ProctoringEvent)
        .where(ProctoringEvent.attempt_id == attempt.id)
        .order_by(ProctoringEvent.occurred_at)
    ).all()
    return events


@router.post("/{attempt_id}/generate-report")
async def generate_report(
    attempt_id: str,
    output_format: str = "html",
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("View Attempt Analysis", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR)),
):
    attempt_pk = parse_uuid_param(attempt_id, detail="Attempt not found")
    attempt = db.get(Attempt, attempt_pk)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    html_content = generate_html_report(db, attempt)
    return HTMLResponse(content=html_content, media_type="text/html")
