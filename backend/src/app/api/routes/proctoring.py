import base64
import asyncio
import json
from collections.abc import Mapping
from datetime import datetime, timezone
from pathlib import Path
import shutil
from uuid import uuid4

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from starlette.websockets import WebSocketState
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...api.deps import ensure_permission, get_current_user, get_db_dep, require_permission, parse_uuid_param
from ...core.security import verify_token
from ...core.config import get_settings
from ...models import Attempt, ProctoringEvent, SeverityEnum, RoleEnum, AttemptStatus, SystemSettings, User
from ...schemas import ProctoringEventRead, Message, ProctoringPingResponse
from ...detection.orchestrator import ProctoringOrchestrator
from ...reporting.report_generator import generate_html_report
from ...services.integrations import send_proctoring_integration_event
from ...modules.tests.proctoring_requirements import get_proctoring_requirements

router = APIRouter()
BASE_STORAGE_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent / "storage"
EVIDENCE_DIR = BASE_STORAGE_DIR / "evidence"
VIDEO_DIR = BASE_STORAGE_DIR / "videos"
VIDEO_CHUNKS_DIR = BASE_STORAGE_DIR / "video_chunks"

SEVERITY_MAP = {
    "HIGH": SeverityEnum.HIGH,
    "MEDIUM": SeverityEnum.MEDIUM,
    "LOW": SeverityEnum.LOW,
}
settings = get_settings()


def _save_evidence(attempt_id: str, frame_bytes: bytes, event_type: str) -> str | None:
    """Save screenshot evidence for HIGH severity events."""
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
    filename = f"{attempt_id}_{event_type}_{ts}.jpg"
    filepath = EVIDENCE_DIR / filename
    filepath.write_bytes(frame_bytes)
    return f"/evidence/{filename}"


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
            attempt.status = AttemptStatus.SUBMITTED
            attempt.submitted_at = occurred_at
            db.add(attempt)
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
        events.append(("ALT_TAB" if blurs else "FOCUS_LOSS", SeverityEnum.MEDIUM))
    if not fullscreen:
        events.append(("FULLSCREEN_EXIT", SeverityEnum.HIGH))
    if camera_dark:
        events.append(("CAMERA_COVERED", SeverityEnum.HIGH))

    now = datetime.now(timezone.utc)
    history_events = _load_attempt_events(db, attempt.id)
    response_alerts: list[dict[str, object]] = []
    forced_submit = False
    submit_reason = None
    for etype, sev in events:
        recent_same = _latest_event_of_type(history_events, etype)
        if recent_same and recent_same.occurred_at:
            try:
                if (now - recent_same.occurred_at).total_seconds() < 8:
                    continue
            except Exception:
                pass
        ev = ProctoringEvent(
            attempt_id=attempt_id,
            event_type=etype,
            severity=sev,
            detail=f"focus={focus}, visibility={visibility}, blurs={blurs}, fullscreen={fullscreen}, camera_dark={camera_dark}",
            occurred_at=now,
        )
        db.add(ev)
        history_events.append(ev)
        rule_result = _apply_alert_rules(db, attempt, attempt.exam.proctoring_config if attempt.exam else {}, ev, history_events, now)
        response_alerts.extend(rule_result["alerts"])
        if rule_result["forced_submit"]:
            forced_submit = True
            submit_reason = rule_result["submit_reason"]
            break
    db.commit()
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
    content = await chunk.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty chunk")
    part_path = chunk_dir / f"{chunk_index:08d}.part"
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
            "url": f"/videos/{filename}",
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

    with output_path.open("wb") as out:
        for part in parts:
            out.write(part.read_bytes())

    file_info = {
        "name": filename,
        "url": f"/videos/{filename}",
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
            "url": f"/videos/{f.name}",
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
        and not settings.PRECHECK_ALLOW_TEST_BYPASS
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

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            if msg_type == "frame":
                b64 = data.get("data")
                if not b64:
                    continue
                frame_bytes = base64.b64decode(b64)
                alerts = orchestrator.process_frame(frame_bytes)

                history_events = _load_attempt_events(db, attempt.id)
                for alert in alerts:
                    severity = SEVERITY_MAP.get(alert.get("severity", "LOW"), SeverityEnum.LOW)
                    meta = alert.get("meta") or {}

                    # Save evidence screenshot for HIGH severity
                    if severity == SeverityEnum.HIGH:
                        evidence_path = _save_evidence(attempt_id, frame_bytes, alert["event_type"])
                        if evidence_path:
                            meta["evidence"] = evidence_path

                    # Write ProctoringEvent to DB
                    event = ProctoringEvent(
                        attempt_id=attempt_id,
                        event_type=alert["event_type"],
                        severity=severity,
                        detail=alert.get("detail"),
                        ai_confidence=alert.get("confidence"),
                        meta=meta if meta else None,
                        occurred_at=datetime.now(timezone.utc),
                    )
                    db.add(event)
                    history_events.append(event)
                    rule_result = _apply_alert_rules(db, attempt, exam_cfg, event, history_events, datetime.now(timezone.utc))
                    db.commit()
                    # Send integrations
                    config_row = db.scalar(select(SystemSettings).where(SystemSettings.key == "integrations_config"))
                    config = {}
                    if config_row and config_row.value:
                        try:
                            import json
                            config = json.loads(config_row.value)
                        except Exception:
                            config = {}
                    try:
                        await send_proctoring_integration_event(event, config)
                    except Exception:
                        pass
                    for escalated_event in rule_result["created_events"]:
                        try:
                            await send_proctoring_integration_event(escalated_event, config)
                        except Exception:
                            pass

                    # Stream alert back to client
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

                # Send summary
                summary = orchestrator.get_summary()
                await websocket.send_json({"type": "summary", "precheck_passed": bool(attempt.precheck_passed_at), **summary})
                if attempt.status == AttemptStatus.SUBMITTED:
                    break
                max_auto = exam_cfg.get("max_alerts_before_autosubmit")
                max_score = exam_cfg.get("max_score_before_autosubmit")
                if (max_auto and orchestrator.alert_count >= max_auto) or (max_score and orchestrator.violation_score >= max_score):
                    attempt.status = AttemptStatus.SUBMITTED
                    attempt.submitted_at = datetime.now(timezone.utc)
                    db.add(attempt)
                    db.commit()
                    await websocket.send_json({"type": "forced_submit"})
                    break

            elif msg_type == "audio":
                b64 = data.get("data")
                if not b64:
                    continue
                audio_bytes = base64.b64decode(b64)
                alerts = orchestrator.process_audio(audio_bytes)

                history_events = _load_attempt_events(db, attempt.id)
                for alert in alerts:
                    severity = SEVERITY_MAP.get(alert.get("severity", "LOW"), SeverityEnum.LOW)
                    event = ProctoringEvent(
                        attempt_id=attempt_id,
                        event_type=alert["event_type"],
                        severity=severity,
                        detail=alert.get("detail"),
                        ai_confidence=alert.get("confidence"),
                        meta=alert.get("meta"),
                        occurred_at=datetime.now(timezone.utc),
                    )
                    db.add(event)
                    history_events.append(event)
                    rule_result = _apply_alert_rules(db, attempt, exam_cfg, event, history_events, datetime.now(timezone.utc))
                    db.commit()

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
                    attempt.status = AttemptStatus.SUBMITTED
                    attempt.submitted_at = datetime.now(timezone.utc)
                    db.add(attempt)
                    db.commit()
                    await websocket.send_json({"type": "forced_submit"})
                    break
            elif msg_type == "screen":
                b64 = data.get("data")
                if not b64:
                    continue
                frame_bytes = base64.b64decode(b64)
                _save_evidence(attempt_id, frame_bytes, "SCREEN")

    except WebSocketDisconnect:
        pass
    except Exception:
        if websocket.application_state == WebSocketState.CONNECTED:
            await websocket.close(code=1011)
    finally:
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
