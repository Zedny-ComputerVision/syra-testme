import base64
import asyncio
import contextlib
import json
import logging
import time
from collections.abc import Mapping
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from starlette.websockets import WebSocketState
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...api.deps import ensure_permission, get_current_user, get_db_dep, require_permission, parse_uuid_param
from ...core.security import verify_token
from ...core.config import get_settings
from ...models import Attempt, Notification, ProctoringEvent, SeverityEnum, RoleEnum, AttemptStatus, SystemSettings, User
from ...services.normalized_relations import exam_proctoring
from ...schemas import ProctoringEventRead, Message, ProctoringPingResponse
from ...detection.orchestrator import ProctoringOrchestrator
from ...detection._yolo_face import get_face_model
from ...reporting.report_generator import generate_html_report
from ...services.integrations import send_proctoring_integration_event
from ...services.audit import write_audit_log
from ...services.notifications import notify_proctoring_event, notify_user
from ...services.cloudflare_media import cloudflare_video_storage_enabled, upload_video_content_to_cloudflare
from ...services.supabase_storage import create_signed_url as create_supabase_signed_url
from ...services.supabase_storage import upload_bytes as upload_bytes_to_supabase
from ...modules.tests.proctoring_requirements import get_proctoring_requirements

router = APIRouter()
BASE_STORAGE_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent / "storage"
EVIDENCE_DIR = BASE_STORAGE_DIR / "evidence"
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


def _normalize_video_source(value: object) -> str:
    normalized = str(value or "camera").strip().lower()
    if normalized in {"camera", "screen"}:
        return normalized
    return "camera"


def _video_filename(attempt_id: str, session_id: str, source: str, extension: str) -> str:
    safe_source = _normalize_video_source(source)
    return f"{attempt_id}_{safe_source}_{session_id}.{extension}"


def _video_storage_provider() -> str:
    return "cloudflare"


def _remote_video_storage_enabled() -> bool:
    return cloudflare_video_storage_enabled()


def _remote_video_storage_error_detail() -> str:
    return "Cloudflare video storage is not configured"


def _is_absolute_http_url(value: object) -> bool:
    raw = str(value or "").strip()
    if not raw:
        return False
    parsed = urlparse(raw)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


async def _hydrate_video_file_info(item: dict[str, object]) -> dict[str, object]:
    hydrated = dict(item or {})
    if str(hydrated.get("provider") or "").strip().lower() != "supabase":
        return hydrated

    object_path = str(hydrated.get("path") or hydrated.get("object_path") or "").strip()
    if not object_path:
        return hydrated

    signed_url = await create_supabase_signed_url(object_path)
    hydrated["url"] = signed_url
    hydrated["playback_url"] = signed_url
    hydrated.setdefault("playback_type", "direct")
    hydrated["ready_to_stream"] = True
    hydrated.setdefault("status", "ready")
    return hydrated


def _normalize_saved_video_meta(meta: object, occurred_at: datetime | None = None) -> dict[str, object] | None:
    if not isinstance(meta, dict):
        return None

    url = str(meta.get("playback_url") or meta.get("url") or "").strip()
    path = str(meta.get("path") or meta.get("object_path") or "").strip()
    name = str(meta.get("name") or "").strip()
    provider = str(meta.get("provider") or "").strip().lower()
    if not provider:
        provider = "supabase" if path else "cloudflare"
    if provider not in {"cloudflare", "supabase"}:
        return None
    if provider == "cloudflare" and not _is_absolute_http_url(url):
        return None
    if provider == "supabase" and not (path or _is_absolute_http_url(url)):
        return None

    created_at = meta.get("created_at")
    if not created_at and occurred_at:
        created_at = occurred_at.isoformat()

    item: dict[str, object] = {
        "name": name or (Path(path).name if path else "") or (str(meta.get("uid") or "").strip() or url.rstrip("/").rsplit("/", 1)[-1] or "recording"),
        "size": int(meta.get("size") or 0),
        "source": _normalize_video_source(meta.get("source")),
        "created_at": created_at,
        "provider": provider,
    }
    if path:
        item["path"] = path
    if _is_absolute_http_url(url):
        item["url"] = url
        item["playback_url"] = str(meta.get("playback_url") or url).strip()

    for key in ("uid", "status", "thumbnail", "duration", "session_id", "playback_type", "recording_started_at", "recording_stopped_at", "bucket"):
        if meta.get(key) not in (None, ""):
            item[key] = meta.get(key)

    if "ready_to_stream" in meta:
        item["ready_to_stream"] = bool(meta.get("ready_to_stream"))

    return item


def _saved_video_events(db: Session, attempt_id: str) -> list[ProctoringEvent]:
    return list(
        db.scalars(
            select(ProctoringEvent)
            .where(
                ProctoringEvent.attempt_id == parse_uuid_param(attempt_id, detail="Attempt not found"),
                ProctoringEvent.event_type == "VIDEO_SAVED",
            )
            .order_by(ProctoringEvent.occurred_at.desc())
        )
    )


def _find_saved_video_file_info(db: Session, attempt_id: str, session_id: str, source: str) -> dict[str, object] | None:
    normalized_source = _normalize_video_source(source)
    for event in _saved_video_events(db, attempt_id):
        info = _normalize_saved_video_meta(event.meta, event.occurred_at)
        if not info:
            continue
        if str(info.get("session_id") or "") == session_id and _normalize_video_source(info.get("source")) == normalized_source:
            return info
    return None


def _build_registered_video_info(
    attempt_id: str,
    payload: Mapping[str, object] | None,
    *,
    session_id: str,
    source: str,
) -> dict[str, object]:
    raw = dict(payload or {})
    remote = raw.get("remote")
    remote = remote if isinstance(remote, dict) else {}
    provider = str(raw.get("provider") or remote.get("provider") or _video_storage_provider() or "cloudflare").strip().lower()
    if provider and provider != "cloudflare":
        raise HTTPException(status_code=400, detail="provider must be cloudflare")

    name = str(raw.get("name") or remote.get("name") or "").strip()
    if not name:
        extension = str(raw.get("extension") or "webm").replace(".", "").lower() or "webm"
        name = _video_filename(attempt_id, session_id, source, extension)

    created_at = raw.get("created_at") or remote.get("created_at") or remote.get("created")
    if not created_at:
        created_at = datetime.now(timezone.utc).isoformat()

    recording_started_at = _normalize_iso_datetime(raw.get("recording_started_at"))
    recording_stopped_at = _normalize_iso_datetime(raw.get("recording_stopped_at"))

    playback_url = str(raw.get("playback_url") or raw.get("url") or remote.get("playback_url") or remote.get("url") or "").strip()
    uid = str(raw.get("uid") or remote.get("uid") or "").strip()
    if not playback_url:
        raise HTTPException(status_code=400, detail="playback_url is required")
    if not _is_absolute_http_url(playback_url):
        raise HTTPException(status_code=400, detail="playback_url must be an absolute Cloudflare URL")

    playback_type = str(raw.get("playback_type") or "").strip().lower()
    if not playback_type:
        playback_type = "hls" if playback_url.endswith(".m3u8") else "direct"

    status = str(raw.get("status") or remote.get("status") or "").strip().lower()
    ready_to_stream = raw.get("ready_to_stream")
    if ready_to_stream is None:
        ready_to_stream = remote.get("ready_to_stream")
    if ready_to_stream is None:
        ready_to_stream = bool(playback_url)

    file_info = {
        "provider": "cloudflare",
        "name": name,
        "url": playback_url,
        "playback_url": playback_url,
        "playback_type": playback_type,
        "size": int(raw.get("size") or remote.get("size") or 0),
        "source": source,
        "session_id": session_id,
        "created_at": created_at,
        "ready_to_stream": bool(ready_to_stream),
        "status": status or ("ready" if ready_to_stream else "processing"),
    }

    thumbnail = raw.get("thumbnail") or remote.get("thumbnail")
    duration = raw.get("duration") or remote.get("duration")
    if uid:
        file_info["uid"] = uid
    if thumbnail:
        file_info["thumbnail"] = thumbnail
    if duration not in (None, ""):
        file_info["duration"] = duration
    if recording_started_at:
        file_info["recording_started_at"] = recording_started_at
    if recording_stopped_at:
        file_info["recording_stopped_at"] = recording_stopped_at
    if remote:
        file_info["remote"] = remote
    return file_info


def _normalize_iso_datetime(value: object) -> str | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        normalized = raw.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid recording timestamp") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat()


def _load_integrations_config(db: Session) -> dict:
    config_row = db.scalar(select(SystemSettings).where(SystemSettings.key == "integrations_config"))
    if not config_row or not config_row.value:
        return {}
    try:
        return json.loads(config_row.value)
    except Exception:
        return {}


async def _save_evidence(attempt_id: str, frame_bytes: bytes, event_type: str) -> str | None:
    """Save screenshot evidence for HIGH severity events."""
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
    filename = f"{attempt_id}_{event_type}_{ts}.jpg"
    if settings.MEDIA_STORAGE_PROVIDER == "supabase":
        await upload_bytes_to_supabase("evidence", filename, frame_bytes, content_type="image/jpeg")
        return f"/api/media/evidence/{filename}"

    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
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


def _ping_event_detail(event_type: str) -> str:
    details = {
        "FOCUS_LOSS": "Test window lost focus or became hidden",
        "FULLSCREEN_EXIT": "Fullscreen mode was exited during the test",
        "CAMERA_COVERED": "Camera view is blocked or too dark",
    }
    return details.get(event_type, f"{_event_label(event_type)} detected")


def _ping_event_meta(*, focus: bool, visibility: str, blurs: int, fullscreen: bool, camera_dark: bool) -> dict[str, object]:
    return {
        "focus": bool(focus),
        "visibility": str(visibility),
        "blurs": int(blurs),
        "fullscreen": bool(fullscreen),
        "camera_dark": bool(camera_dark),
        "source": "client_ping",
    }


def _runtime_proctoring_enabled(exam_cfg: Mapping[str, object] | None, requirements: Mapping[str, bool]) -> bool:
    config = exam_cfg or {}
    return bool(
        config.get("face_detection")
        or config.get("multi_face")
        or config.get("audio_detection")
        or config.get("object_detection")
        or config.get("eye_tracking")
        or config.get("head_pose_detection")
        or config.get("mouth_detection")
        or config.get("tab_switch_detect")
        or requirements.get("camera_required")
        or requirements.get("mic_required")
        or requirements.get("fullscreen_required")
        or requirements.get("lighting_required")
        or requirements.get("screen_required")
        or requirements.get("identity_required")
        or bool(config.get("alert_rules"))
    )


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
    exam_cfg = exam_proctoring(attempt.exam) if attempt.exam else {}
    requirements = get_proctoring_requirements(exam_cfg)
    if not _runtime_proctoring_enabled(exam_cfg, requirements):
        return {
            "detail": "ok",
            "alerts": [],
            "forced_submit": False,
            "submit_reason": None,
        }
    focus = payload.get("focus", True)
    visibility = payload.get("visibility", "visible")
    blurs = payload.get("blurs", 0)
    fullscreen = payload.get("fullscreen", True)
    camera_dark = bool(payload.get("camera_dark"))
    events = []
    camera_monitoring_enabled = bool(
        requirements["camera_required"]
        or requirements["lighting_required"]
        or requirements["identity_required"]
        or exam_cfg.get("face_detection")
        or exam_cfg.get("multi_face")
    )
    if (not focus or visibility != "visible") and exam_cfg.get("tab_switch_detect"):
        events.append(("FOCUS_LOSS", SeverityEnum.MEDIUM))
    if not fullscreen and requirements["fullscreen_required"]:
        events.append(("FULLSCREEN_EXIT", SeverityEnum.HIGH))
    if camera_dark and camera_monitoring_enabled:
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
        detail = _ping_event_detail(etype)
        ev = ProctoringEvent(
            attempt_id=attempt_id,
            event_type=etype,
            severity=sev,
            detail=detail,
            meta=_ping_event_meta(
                focus=focus,
                visibility=visibility,
                blurs=blurs,
                fullscreen=fullscreen,
                camera_dark=camera_dark,
            ),
            occurred_at=now,
        )
        db.add(ev)
        history_events.append(ev)
        created_events.append(ev)
        response_alerts.append({
            "event_type": etype,
            "severity": sev,
            "detail": detail,
        })
        rule_result = _apply_alert_rules(
            db,
            attempt,
            exam_cfg,
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
    raise HTTPException(
        status_code=410,
        detail="Chunked local video capture has been removed. Upload the finalized video through /video/upload.",
    )


@router.post("/{attempt_id}/video/chunk", response_model=Message)
async def upload_video_chunk(
    attempt_id: str,
    session_id: str = Form(...),
    chunk_index: int = Form(..., ge=0),
    chunk: UploadFile = File(...),
    db: Session = Depends(get_db_dep),
    current=Depends(get_current_user),
):
    raise HTTPException(
        status_code=410,
        detail="Chunked local video capture has been removed. Upload the finalized video through /video/upload.",
    )


@router.post("/{attempt_id}/video/finalize")
async def finalize_video_capture(
    attempt_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db_dep),
    current=Depends(get_current_user),
):
    raise HTTPException(
        status_code=410,
        detail="Local video finalize has been removed. Upload the finalized video through /video/upload.",
    )


@router.post("/{attempt_id}/video/upload")
async def upload_video_capture(
    attempt_id: str,
    request: Request,
    session_id: str,
    source: str = "camera",
    filename: str | None = None,
    recording_started_at: str | None = None,
    recording_stopped_at: str | None = None,
    db: Session = Depends(get_db_dep),
    current=Depends(get_current_user),
):
    _attempt_or_forbidden(attempt_id, db, current)
    if not _remote_video_storage_enabled():
        raise HTTPException(status_code=503, detail=_remote_video_storage_error_detail())

    normalized_source = _normalize_video_source(source)
    session_id = str(session_id or "").strip()
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")

    existing_file_info = _find_saved_video_file_info(db, attempt_id, session_id, normalized_source)
    if existing_file_info:
        return {"detail": "video already uploaded", "file": await _hydrate_video_file_info(existing_file_info)}

    content_type = str(request.headers.get("content-type") or "application/octet-stream").split(";", 1)[0].strip().lower()
    if not (content_type.startswith("video/") or content_type == "application/octet-stream"):
        raise HTTPException(status_code=415, detail="Invalid video upload content type")

    content = await request.body()
    if not content:
        raise HTTPException(status_code=400, detail="Empty video upload")

    extension = filename.rsplit(".", 1)[-1].lower() if filename and "." in filename else (
        "mp4" if "mp4" in content_type else "webm"
    )
    safe_filename = filename or _video_filename(attempt_id, session_id, normalized_source, extension)
    normalized_recording_started_at = _normalize_iso_datetime(recording_started_at)
    normalized_recording_stopped_at = _normalize_iso_datetime(recording_stopped_at)

    try:
        remote = await upload_video_content_to_cloudflare(
            content,
            filename=safe_filename,
            source=normalized_source,
            content_type=content_type,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Cloudflare video upload failed: {exc}") from exc

    file_info = _build_registered_video_info(
        attempt_id,
        {
            "provider": "cloudflare",
            "session_id": session_id,
            "source": normalized_source,
            "extension": extension,
            "name": remote.get("name") or safe_filename,
            "url": remote.get("url") or remote.get("playback_url"),
            "playback_url": remote.get("playback_url") or remote.get("url"),
            "playback_type": remote.get("playback_type"),
            "thumbnail": remote.get("thumbnail"),
            "uid": remote.get("uid"),
            "status": remote.get("status"),
            "ready_to_stream": remote.get("ready_to_stream"),
            "duration": remote.get("duration"),
            "size": remote.get("size") or len(content),
            "created_at": remote.get("created_at"),
            "recording_started_at": normalized_recording_started_at,
            "recording_stopped_at": normalized_recording_stopped_at,
            "remote": remote.get("remote") if isinstance(remote.get("remote"), dict) else remote,
        },
        session_id=session_id,
        source=normalized_source,
    )
    event = ProctoringEvent(
        attempt_id=attempt_id,
        event_type="VIDEO_SAVED",
        severity=SeverityEnum.LOW,
        detail=f"Proctoring {normalized_source} video saved",
        meta=file_info,
        occurred_at=datetime.now(timezone.utc),
    )
    db.add(event)
    db.commit()
    return {"detail": "video uploaded", "file": await _hydrate_video_file_info(file_info)}


@router.post("/{attempt_id}/video/register")
async def register_video_capture(
    attempt_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db_dep),
    current=Depends(get_current_user),
):
    _attempt_or_forbidden(attempt_id, db, current)
    if not _remote_video_storage_enabled():
        raise HTTPException(status_code=503, detail=_remote_video_storage_error_detail())

    session_id = str(payload.get("session_id") or "").strip()
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")
    source = _normalize_video_source(payload.get("source"))

    existing_file_info = _find_saved_video_file_info(db, attempt_id, session_id, source)
    if existing_file_info:
        return {"detail": "video already registered", "file": await _hydrate_video_file_info(existing_file_info)}

    file_info = _build_registered_video_info(attempt_id, payload, session_id=session_id, source=source)
    event = ProctoringEvent(
        attempt_id=attempt_id,
        event_type="VIDEO_SAVED",
        severity=SeverityEnum.LOW,
        detail=f"Proctoring {source} video saved",
        meta=file_info,
        occurred_at=datetime.now(timezone.utc),
    )
    db.add(event)
    db.commit()
    return {"detail": "video registered", "file": await _hydrate_video_file_info(file_info)}


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
    result: list[dict[str, object]] = []
    seen_keys: set[tuple[str, str]] = set()

    for event in _saved_video_events(db, attempt_id):
        item = _normalize_saved_video_meta(event.meta, event.occurred_at)
        if not item:
            continue
        key = (
            str(item.get("session_id") or item.get("path") or item.get("name") or item.get("url") or ""),
            str(item.get("source") or "camera"),
        )
        if key in seen_keys:
            continue
        seen_keys.add(key)
        result.append(await _hydrate_video_file_info(item))
    result.sort(key=lambda item: str(item.get("created_at") or ""), reverse=True)
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
    exam_cfg = exam_proctoring(attempt.exam) if attempt and attempt.exam else {}
    exam_cfg = exam_cfg.copy() if exam_cfg else {}
    proctoring_requirements = get_proctoring_requirements(exam_cfg)
    if not _runtime_proctoring_enabled(exam_cfg, proctoring_requirements):
        await websocket.send_json({"type": "disabled"})
        await websocket.close(code=1000)
        db.close()
        return
    if (
        proctoring_requirements["identity_required"]
        and not attempt.precheck_passed_at
        and not settings.precheck_test_bypass_enabled
    ):
        await websocket.send_json({"type": "alert", "event_type": "PRECHECK_BYPASS_DENIED", "severity": "HIGH", "detail": "Pre-exam checks not completed"})
        await websocket.close(code=4403)
        db.close()
        return

    if getattr(attempt, "face_signature", None):
        exam_cfg["face_signature"] = attempt.face_signature
    if (exam_cfg.get("face_detection") or exam_cfg.get("multi_face")) and get_face_model() is None:
        logger.error("Face detection model unavailable for attempt %s", attempt_id)
        await websocket.send_json({
            "type": "error",
            "detail": "Face detection model unavailable. Face and multiple-face alerts are disabled until the model is restored.",
        })
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
                            evidence_path = await _save_evidence(attempt_id, frame_bytes, alert["event_type"])
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
                    await _save_evidence(attempt_id, frame_bytes, "SCREEN")
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
