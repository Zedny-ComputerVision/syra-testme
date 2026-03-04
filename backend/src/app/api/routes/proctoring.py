import base64
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from starlette.websockets import WebSocketState
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...api.deps import get_current_user, get_db_dep, require_role
from ...core.security import verify_token
from ...models import Attempt, ProctoringEvent, SeverityEnum, RoleEnum, AttemptStatus
from ...schemas import ProctoringEventRead, Message
from ...detection.orchestrator import ProctoringOrchestrator
from ...reporting.report_generator import generate_html_report
from ...services.integrations import send_proctoring_integration_event
from ...api.routes.admin_settings import get_db_dep
from sqlalchemy import select
from ...models import SystemSettings, ExamStatus
from fastapi import Body

router = APIRouter()

SEVERITY_MAP = {
    "HIGH": SeverityEnum.HIGH,
    "MEDIUM": SeverityEnum.MEDIUM,
    "LOW": SeverityEnum.LOW,
}


def _save_evidence(attempt_id: str, frame_bytes: bytes, event_type: str) -> str | None:
    """Save screenshot evidence for HIGH severity events."""
    from pathlib import Path
    evidence_dir = Path(__file__).resolve().parent.parent.parent.parent.parent / "storage" / "evidence"
    evidence_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
    filename = f"{attempt_id}_{event_type}_{ts}.jpg"
    filepath = evidence_dir / filename
    filepath.write_bytes(frame_bytes)
    return str(filepath)


@router.post("/{attempt_id}/ping", response_model=Message)
async def proctoring_ping(
    attempt_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db_dep),
    current=Depends(get_current_user),
):
    attempt = db.get(Attempt, attempt_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if current.role == RoleEnum.LEARNER and attempt.user_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")
    focus = payload.get("focus", True)
    visibility = payload.get("visibility", "visible")
    blurs = payload.get("blurs", 0)
    fullscreen = payload.get("fullscreen", True)
    events = []
    if not focus or visibility != "visible":
        events.append(("ALT_TAB" if blurs else "FOCUS_LOSS", SeverityEnum.MEDIUM))
    if not fullscreen:
        events.append(("FULLSCREEN_EXIT", SeverityEnum.HIGH))
    for etype, sev in events:
        ev = ProctoringEvent(
            attempt_id=attempt_id,
            event_type=etype,
            severity=sev,
            detail=f"focus={focus}, visibility={visibility}, blurs={blurs}, fullscreen={fullscreen}",
            occurred_at=datetime.now(timezone.utc),
        )
        db.add(ev)
    db.commit()
    return Message(detail="ok")


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
    attempt = db.get(Attempt, attempt_id)
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
    if not attempt.precheck_passed_at:
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

                    # Stream alert back to client
                    await websocket.send_json({
                        "type": "alert",
                        "event_type": alert["event_type"],
                        "severity": alert["severity"],
                        "detail": alert.get("detail", ""),
                        "confidence": alert.get("confidence", 0),
                    })

                # Send summary
                summary = orchestrator.get_summary()
                await websocket.send_json({"type": "summary", "precheck_passed": bool(attempt.precheck_passed_at), **summary})
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
                    db.commit()

                    await websocket.send_json({
                        "type": "alert",
                        "event_type": alert["event_type"],
                        "severity": alert["severity"],
                        "detail": alert.get("detail", ""),
                        "confidence": alert.get("confidence", 0),
                    })

                summary = orchestrator.get_summary()
                await websocket.send_json({"type": "summary", **summary})
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
    attempt = db.get(Attempt, attempt_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if current.role == RoleEnum.LEARNER and attempt.user_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")
    events = db.scalars(
        select(ProctoringEvent)
        .where(ProctoringEvent.attempt_id == attempt_id)
        .order_by(ProctoringEvent.occurred_at)
    ).all()
    return events


@router.post("/{attempt_id}/generate-report")
async def generate_report(
    attempt_id: str,
    output_format: str = "html",
    db: Session = Depends(get_db_dep),
    current=Depends(require_role(RoleEnum.ADMIN, RoleEnum.INSTRUCTOR)),
):
    attempt = db.get(Attempt, attempt_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    html_content = generate_html_report(db, attempt)
    return HTMLResponse(content=html_content, media_type="text/html")
