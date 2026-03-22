import base64
import asyncio
import contextlib
import json
import logging

import tempfile
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
from ...detection.screen_analysis import analyze_screen_bytes
from ...reporting.report_generator import generate_html_report
from ...services.integrations import send_proctoring_integration_event
from ...services.audit import write_audit_log
from ...services.notifications import notify_proctoring_event, notify_user
from ...services.cloudflare_media import cloudflare_video_storage_enabled, upload_video_to_cloudflare
from ...services.supabase_storage import create_signed_url as create_supabase_signed_url
from ...services.supabase_storage import upload_bytes as upload_bytes_to_supabase
from ...utils.request_ip import get_request_ip, get_websocket_ip
from ...modules.tests.proctoring_requirements import get_proctoring_requirements

router = APIRouter()
BASE_STORAGE_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent / "storage"
EVIDENCE_DIR = BASE_STORAGE_DIR / "evidence"
HEARTBEAT_INTERVAL_SECONDS = 10
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

# ── Live monitoring registry ──────────────────────────────────────────────────
# Maps attempt_id → set of admin WebSocket connections watching that session.
# Also stores the latest frame thumbnail + session metadata for new viewers.
_live_viewers: dict[str, set[WebSocket]] = {}
_live_session_info: dict[str, dict] = {}  # attempt_id → {user_name, exam_title, started_at, ...}
_live_latest_thumb: dict[str, bytes] = {}  # attempt_id → last JPEG thumbnail (small)


async def _broadcast_to_viewers(attempt_id: str, message: dict) -> None:
    """Send a JSON message to all admin viewers watching this attempt."""
    viewers = _live_viewers.get(attempt_id)
    if not viewers:
        return
    dead: list[WebSocket] = []
    for ws in viewers:
        try:
            if ws.application_state == WebSocketState.CONNECTED:
                await ws.send_json(message)
            else:
                dead.append(ws)
        except Exception:
            dead.append(ws)
    for ws in dead:
        viewers.discard(ws)


async def _broadcast_bytes_to_viewers(attempt_id: str, data: bytes, msg_type: str = "frame") -> None:
    """Send binary data (frame thumbnail) to admin viewers."""
    viewers = _live_viewers.get(attempt_id)
    if not viewers:
        return
    # Prepend a type byte: 0x01 = frame, 0x02 = screen
    type_byte = b'\x01' if msg_type == "frame" else b'\x02'
    payload = type_byte + data
    dead: list[WebSocket] = []
    for ws in viewers:
        try:
            if ws.application_state == WebSocketState.CONNECTED:
                await ws.send_bytes(payload)
            else:
                dead.append(ws)
        except Exception:
            dead.append(ws)
    for ws in dead:
        viewers.discard(ws)


def _check_object_model_available() -> bool:
    """Check if the general YOLOv8 object detection model can be loaded."""
    try:
        from ...detection.object_detection import ObjectDetector
        det = ObjectDetector()
        return det._get_model() is not None
    except Exception:
        return False


def _normalize_video_source(value: object) -> str:
    normalized = str(value or "camera").strip().lower()
    if normalized in {"camera", "screen"}:
        return normalized
    return "camera"


def _video_filename(attempt_id: str, session_id: str, source: str, extension: str) -> str:
    safe_source = _normalize_video_source(source)
    return f"{attempt_id}_{safe_source}_{session_id}.{extension}"


def _video_storage_provider() -> str:
    provider = get_settings().PROCTORING_VIDEO_STORAGE_PROVIDER
    if provider == "cloudflare":
        if not cloudflare_video_storage_enabled():
            raise HTTPException(
                status_code=503,
                detail="Cloudflare video storage is not properly configured. "
                       "Please set CLOUDFLARE_MEDIA_API_BASE_URL.",
            )
        return "cloudflare"
    if provider == "supabase":
        from ...services.supabase_storage import supabase_video_storage_enabled
        if not supabase_video_storage_enabled():
            raise HTTPException(
                status_code=503,
                detail="Supabase video storage is not properly configured.",
            )
        return "supabase"
    raise HTTPException(
        status_code=503,
        detail=f"Unsupported video storage provider: {provider}",
    )



def _require_cloudflare_video_storage() -> None:
    provider = str(get_settings().PROCTORING_VIDEO_STORAGE_PROVIDER or "").strip().lower()
    if provider != "cloudflare":
        raise HTTPException(status_code=503, detail="Cloudflare video storage must be enabled for proctoring recordings")
    if not cloudflare_video_storage_enabled():
        raise HTTPException(status_code=503, detail="Cloudflare video storage is not configured")


def _is_absolute_http_url(value: object) -> bool:
    raw = str(value or "").strip()
    if not raw:
        return False
    parsed = urlparse(raw)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


async def _hydrate_video_file_info(item: dict[str, object]) -> dict[str, object]:
    hydrated = dict(item or {})
    provider = str(hydrated.get("provider") or "").strip().lower()
    if provider != "supabase":
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
        provider = "supabase" if path.startswith("videos/") else "cloudflare"
    if provider not in {"cloudflare", "supabase"}:
        return None
    if provider == "cloudflare" and not _is_absolute_http_url(url):
        return None
    if provider == "supabase" and not (path or _is_absolute_http_url(url)):
        return None

    created_at = meta.get("created_at")
    if not created_at and occurred_at:
        created_at = occurred_at.isoformat()

    resolved_name = name or (Path(path).name if path else "") or (str(meta.get("uid") or "").strip() or url.rstrip("/").rsplit("/", 1)[-1] or "recording")
    item: dict[str, object] = {
        "name": resolved_name,
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
        item["ready_to_stream"] = True

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


def _coerce_non_negative_int(value: object) -> int:
    try:
        numeric = int(float(value))
    except (TypeError, ValueError):
        return 0
    return max(0, numeric)


def _clamp_progress_percent(value: object, *, default: int = 0) -> int:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        numeric = float(default)
    return max(0, min(100, int(round(numeric))))


def _normalize_video_upload_status(value: object) -> str:
    normalized = str(value or "uploading").strip().lower()
    if normalized in {"not_started", "queued", "uploading", "processing", "complete", "error"}:
        return normalized
    return "uploading"


def _normalize_video_upload_progress_meta(meta: object, occurred_at: datetime | None = None) -> dict[str, object] | None:
    if not isinstance(meta, dict):
        return None

    session_id = str(meta.get("session_id") or "").strip()
    source = _normalize_video_source(meta.get("source"))
    uploaded_bytes = _coerce_non_negative_int(meta.get("uploaded_bytes"))
    total_bytes = _coerce_non_negative_int(meta.get("total_bytes"))
    if total_bytes > 0 and uploaded_bytes > total_bytes:
        uploaded_bytes = total_bytes

    progress_percent = meta.get("progress_percent")
    if progress_percent in (None, "") and total_bytes > 0:
        progress_percent = (uploaded_bytes / total_bytes) * 100
    normalized_status = _normalize_video_upload_status(meta.get("status"))
    normalized_percent = _clamp_progress_percent(progress_percent, default=0)

    if normalized_status == "complete":
        normalized_percent = 100
    elif normalized_status in {"uploading", "processing"}:
        normalized_percent = min(99, normalized_percent)

    created_at = meta.get("created_at")
    if not created_at and occurred_at:
        created_at = occurred_at.isoformat()

    return {
        "session_id": session_id,
        "source": source,
        "uploaded_bytes": uploaded_bytes,
        "total_bytes": total_bytes,
        "progress_percent": normalized_percent,
        "status": normalized_status,
        "created_at": created_at,
    }


def _expected_video_sources(attempt: Attempt) -> list[str]:
    if not attempt.exam:
        return []

    requirements = get_proctoring_requirements(exam_proctoring(attempt.exam))
    sources: list[str] = []
    if requirements.get("camera_required"):
        sources.append("camera")
    if requirements.get("screen_required"):
        sources.append("screen")
    return sources


def _build_attempt_video_upload_summary(
    attempt: Attempt,
    *,
    saved_by_source: Mapping[str, dict[str, object]] | None = None,
    progress_by_source: Mapping[str, dict[str, object]] | None = None,
) -> dict[str, object]:
    saved_items = dict(saved_by_source or {})
    progress_items = dict(progress_by_source or {})
    required_sources = _expected_video_sources(attempt)
    available_sources = set(required_sources) | set(saved_items.keys()) | set(progress_items.keys())
    ordered_sources = [source for source in ("camera", "screen") if source in available_sources]
    ordered_sources.extend(sorted(source for source in available_sources if source not in {"camera", "screen"}))

    source_summaries: list[dict[str, object]] = []
    for source in ordered_sources:
        saved_item = saved_items.get(source)
        progress_item = progress_items.get(source)
        if saved_item:
            size = _coerce_non_negative_int(saved_item.get("size"))
            source_summaries.append({
                "source": source,
                "label": source.title(),
                "session_id": str(saved_item.get("session_id") or ""),
                "progress_percent": 100,
                "remaining_percent": 0,
                "status": "complete",
                "uploaded_bytes": size,
                "total_bytes": size,
                "has_saved_video": True,
            })
            continue

        progress_percent = _clamp_progress_percent(progress_item.get("progress_percent") if progress_item else 0, default=0)
        status = _normalize_video_upload_status(progress_item.get("status") if progress_item else "not_started")
        if status in {"uploading", "processing"}:
            progress_percent = min(99, progress_percent)
        if status == "complete":
            progress_percent = 100

        source_summaries.append({
            "source": source,
            "label": source.title(),
            "session_id": str(progress_item.get("session_id") or "") if progress_item else "",
            "progress_percent": progress_percent,
            "remaining_percent": max(0, 100 - progress_percent),
            "status": status,
            "uploaded_bytes": _coerce_non_negative_int(progress_item.get("uploaded_bytes")) if progress_item else 0,
            "total_bytes": _coerce_non_negative_int(progress_item.get("total_bytes")) if progress_item else 0,
            "has_saved_video": False,
        })

    upload_percent = (
        int(round(sum(int(item["progress_percent"]) for item in source_summaries) / len(source_summaries)))
        if source_summaries else 0
    )
    remaining_percent = max(0, 100 - upload_percent)
    failed = any(item["status"] == "error" for item in source_summaries)
    uploading = any(item["status"] in {"queued", "uploading", "processing"} for item in source_summaries)
    has_video = bool(saved_items)
    completed_sources = [item["source"] for item in source_summaries if int(item["progress_percent"]) >= 100]
    all_required_uploaded = bool(required_sources) and all(source in saved_items for source in required_sources)

    if source_summaries and len(completed_sources) == len(source_summaries):
        summary_status = "complete"
        status_label = "Upload complete"
    elif failed:
        summary_status = "error"
        status_label = "Upload failed"
    elif uploading or upload_percent > 0:
        summary_status = "uploading"
        status_label = "Uploading in background"
    elif attempt.status in {AttemptStatus.SUBMITTED, AttemptStatus.GRADED}:
        summary_status = "waiting"
        status_label = "Waiting to upload"
    else:
        summary_status = "not_started"
        status_label = "Not started"

    return {
        "attempt_id": str(attempt.id),
        "has_video": has_video,
        "saved_video_count": len(saved_items),
        "required_sources": required_sources,
        "completed_sources": completed_sources,
        "upload_percent": upload_percent,
        "remaining_percent": remaining_percent,
        "uploading": uploading and not all_required_uploaded,
        "all_required_uploaded": all_required_uploaded,
        "status": summary_status,
        "status_label": status_label,
        "sources": source_summaries,
    }


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
    provider = str(raw.get("provider") or remote.get("provider") or _video_storage_provider()).strip().lower()
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


async def _build_supabase_video_info(
    attempt_id: str,
    *,
    session_id: str,
    source: str,
    filename: str,
    content: bytes,
    content_type: str,
    recording_started_at: str | None,
    recording_stopped_at: str | None,
) -> dict[str, object]:
    safe_filename = Path(filename).name
    if not safe_filename:
        raise HTTPException(status_code=400, detail="A valid video filename is required")

    try:
        uploaded = await upload_bytes_to_supabase(
            "videos",
            safe_filename,
            bytes(content or b""),
            content_type=content_type or "application/octet-stream",
        )
    except Exception as exc:
        logger.exception("Supabase video upload failed for attempt %s", attempt_id)
        raise HTTPException(status_code=502, detail="Supabase video upload failed") from exc

    playback_url = str(uploaded.get("url") or "").strip()
    object_path = str(uploaded.get("path") or "").strip()
    if not playback_url and not object_path:
        raise HTTPException(status_code=502, detail="Supabase video upload returned no file reference")

    return {
        "provider": "supabase",
        "name": str(uploaded.get("name") or safe_filename),
        "path": object_path,
        "url": playback_url,
        "playback_url": playback_url,
        "playback_type": "direct",
        "size": int(uploaded.get("size") or len(content or b"")),
        "source": _normalize_video_source(source),
        "session_id": session_id,
        "created_at": str(uploaded.get("created_at") or datetime.now(timezone.utc).isoformat()),
        "ready_to_stream": True,
        "status": "ready",
        "recording_started_at": recording_started_at,
        "recording_stopped_at": recording_stopped_at,
        "bucket": uploaded.get("bucket"),
    }


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
    """Save screenshot evidence for proctoring events."""
    import secrets
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
    token = secrets.token_hex(8)
    filename = f"{attempt_id}_{event_type}_{ts}_{token}.jpg"
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


async def _write_video_upload_to_temp_file(request: Request, *, suffix: str) -> tuple[Path, int]:
    upload_limit_bytes = settings.MAX_VIDEO_UPLOAD_MB * 1024 * 1024
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    temp_path = Path(temp_file.name)
    total_size = 0

    try:
        async for chunk in request.stream():
            if not chunk:
                continue
            total_size += len(chunk)
            if total_size > upload_limit_bytes:
                raise HTTPException(
                    status_code=413,
                    detail=f"Video upload exceeds the {settings.MAX_VIDEO_UPLOAD_MB} MB limit",
                )
            temp_file.write(chunk)
    except Exception:
        temp_file.close()
        temp_path.unlink(missing_ok=True)
        raise
    finally:
        temp_file.close()

    if total_size == 0:
        temp_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Empty video upload")

    return temp_path, total_size


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
        # Auto-score so the learner sees results immediately
        try:
            from ..attempts.routes_public import _auto_score_attempt
            score_result = _auto_score_attempt(attempt, db)
            if score_result.get("score") is not None:
                attempt.score = score_result["score"]
                attempt.grade = score_result.get("grade")
        except Exception as score_err:
            logger.warning("Auto-score failed during forced submit for attempt %s: %s", attempt.id, score_err)
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


AUTO_SUBMIT_EXCLUDED_EVENT_TYPES = {
    "VIDEO_SAVED", "VIDEO_UPLOADED", "FACE_REAPPEARED",
    "ATTEMPT_PAUSED", "ATTEMPT_RESUMED",
    "SCREEN_SHARE_LOST",  # browser fullscreen ↔ screen-share conflict, not cheating
    "TAB_SWITCH",         # browser fires spurious blur events during screen share
}


def _count_auto_submit_alerts(events: list[ProctoringEvent]) -> int:
    count = 0
    for event in events:
        if event.event_type in AUTO_SUBMIT_EXCLUDED_EVENT_TYPES:
            continue
        count += 1
    return count


def _maybe_auto_submit_from_history(
    db: Session,
    attempt: Attempt,
    exam_cfg: Mapping[str, object] | None,
    history_events: list[ProctoringEvent],
    *,
    occurred_at: datetime,
    request_ip: str | None = None,
    violation_score: float | int | None = None,
) -> str | None:
    if attempt.status == AttemptStatus.SUBMITTED:
        return None

    config = exam_cfg if isinstance(exam_cfg, Mapping) else {}
    max_auto = config.get("max_alerts_before_autosubmit")
    max_score = config.get("max_score_before_autosubmit")
    violation_count = _count_auto_submit_alerts(history_events)

    auto_by_count = bool(max_auto and violation_count >= int(max_auto))
    auto_by_score = bool(max_score and violation_score is not None and float(violation_score) >= float(max_score))
    if not auto_by_count and not auto_by_score:
        return None

    reason = (
        f"Auto-submitted due to {violation_count} proctoring alerts"
        if auto_by_count
        else f"Auto-submitted due to risk score {float(violation_score):.2f}"
    )
    _auto_submit_attempt(
        db,
        attempt,
        violation_count=violation_count,
        reason=reason,
        occurred_at=occurred_at,
        request_ip=request_ip,
    )
    return reason


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
    conditions = rule.get("conditions")
    if isinstance(conditions, list) and len(conditions) > 0:
        cond_labels = [
            f"{_event_label(str(c.get('event_type', '?')))} >= {c.get('threshold', 1)}"
            for c in conditions if isinstance(c, Mapping)
        ]
        window = rule.get("window_seconds")
        window_str = f" within {int(window)}s" if window else ""
        return (
            f"Compound rule triggered: {' AND '.join(cond_labels)}{window_str}. "
            f"Action: {_action_label(str(rule.get('action') or 'WARN'))}."
        )
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

        # ── AND-logic rules: require multiple conditions to ALL be met ──
        conditions = rule.get("conditions")
        if isinstance(conditions, list) and len(conditions) > 0:
            rule_id = str(rule.get("id") or "compound-" + "-".join(
                str(c.get("event_type", "?")) for c in conditions if isinstance(c, Mapping)
            ))
            if _rule_already_triggered(history_events, rule_id):
                continue
            window_sec = float(rule.get("window_seconds", 0))
            all_met = True
            for cond in conditions:
                if not isinstance(cond, Mapping):
                    all_met = False
                    break
                cond_type = str(cond.get("event_type") or "").upper()
                cond_threshold = max(1, int(cond.get("threshold") or 1))
                if window_sec > 0:
                    cutoff = occurred_at - timedelta(seconds=window_sec)
                    cond_count = sum(
                        1 for e in history_events
                        if e.event_type == cond_type
                        and e.occurred_at is not None
                        and e.occurred_at >= cutoff
                    )
                else:
                    cond_count = sum(1 for e in history_events if e.event_type == cond_type)
                if cond_count < cond_threshold:
                    all_met = False
                    break
            if not all_met:
                continue
            # All conditions met — fall through to action handling below
            matching_count = sum(1 for e in history_events if e.event_type == source_event.event_type)
        else:
            # ── Single event_type rule (original logic) ──
            if str(rule.get("event_type") or "").upper() != source_event.event_type:
                continue
            threshold = max(1, int(rule.get("threshold") or 1))
            rule_id = str(rule.get("id") or f"{source_event.event_type}-{threshold}")
            if matching_count < threshold or _rule_already_triggered(history_events, rule_id):
                continue

        action = str(rule.get("action") or "WARN").upper()
        severity_name = str(rule.get("severity") or "MEDIUM").upper()
        severity = SeverityEnum(severity_name if severity_name in {"LOW", "MEDIUM", "HIGH"} else "MEDIUM")
        is_compound = isinstance(rule.get("conditions"), list)
        threshold_val = int(rule.get("threshold") or 1) if not is_compound else 0
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
                "threshold": threshold_val,
                "actual_count": matching_count,
                **({"conditions": conditions} if is_compound else {}),
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
                "threshold": threshold_val,
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
    # Per-type dedup windows: noisy events get longer cooldowns
    _PING_DEDUP_SECONDS = {"FOCUS_LOSS": 30, "FULLSCREEN_EXIT": 8, "CAMERA_COVERED": 8}
    for etype, sev in events:
        recent_same = _latest_event_of_type(history_events, etype)
        if recent_same and recent_same.occurred_at:
            try:
                dedup_s = _PING_DEDUP_SECONDS.get(etype, 8)
                if (now - recent_same.occurred_at).total_seconds() < dedup_s:
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
            request_ip=get_request_ip(request),
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

    extension = filename.rsplit(".", 1)[-1].lower() if filename and "." in filename else (
        "mp4" if "mp4" in content_type else "webm"
    )
    safe_filename = filename or _video_filename(attempt_id, session_id, normalized_source, extension)
    normalized_recording_started_at = _normalize_iso_datetime(recording_started_at)
    normalized_recording_stopped_at = _normalize_iso_datetime(recording_stopped_at)
    temp_path, upload_size = await _write_video_upload_to_temp_file(request, suffix=f".{extension}")

    file_info: dict[str, object]
    response_detail = "video uploaded"
    provider = _video_storage_provider()
    try:
        if provider == "cloudflare":
            try:
                remote = await upload_video_to_cloudflare(
                    temp_path,
                    filename=safe_filename,
                    source=normalized_source,
                )
            except Exception as exc:
                logger.exception("Cloudflare video upload failed for attempt %s", attempt_id)
                raise HTTPException(status_code=502, detail="Cloudflare video upload failed") from exc
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
                    "size": remote.get("size") or upload_size,
                    "created_at": remote.get("created_at"),
                    "recording_started_at": normalized_recording_started_at,
                    "recording_stopped_at": normalized_recording_stopped_at,
                    "remote": remote.get("remote") if isinstance(remote.get("remote"), dict) else remote,
                },
                session_id=session_id,
                source=normalized_source,
            )
        elif provider == "supabase":
            file_info = await _build_supabase_video_info(
                attempt_id,
                session_id=session_id,
                source=normalized_source,
                filename=safe_filename,
                content=temp_path.read_bytes(),
                content_type=content_type,
                recording_started_at=normalized_recording_started_at,
                recording_stopped_at=normalized_recording_stopped_at,
            )
        else:
            raise HTTPException(status_code=503, detail=f"Unsupported video storage provider: {provider}")
    finally:
        temp_path.unlink(missing_ok=True)

    file_info["upload_ip"] = get_request_ip(request)
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
    return {"detail": response_detail, "file": await _hydrate_video_file_info(file_info)}


@router.post("/{attempt_id}/video/register")
async def register_video_capture(
    attempt_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db_dep),
    current=Depends(get_current_user),
):
    _attempt_or_forbidden(attempt_id, db, current)
    _require_cloudflare_video_storage()

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


@router.post("/{attempt_id}/video/upload-progress", response_model=Message)
async def report_video_upload_progress(
    attempt_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db_dep),
    current=Depends(get_current_user),
):
    _attempt_or_forbidden(attempt_id, db, current)

    session_id = str(payload.get("session_id") or "").strip()
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")

    source = _normalize_video_source(payload.get("source"))
    if _find_saved_video_file_info(db, attempt_id, session_id, source):
        return Message(detail="Video already saved")

    uploaded_bytes = _coerce_non_negative_int(payload.get("uploaded_bytes"))
    total_bytes = _coerce_non_negative_int(payload.get("total_bytes"))
    if total_bytes > 0 and uploaded_bytes > total_bytes:
        uploaded_bytes = total_bytes

    status = _normalize_video_upload_status(payload.get("status"))
    progress_percent = payload.get("progress_percent")
    if progress_percent in (None, "") and total_bytes > 0:
        progress_percent = (uploaded_bytes / total_bytes) * 100
    normalized_percent = _clamp_progress_percent(progress_percent, default=0)

    if status == "complete":
        normalized_percent = 100
    elif status in {"uploading", "processing"}:
        normalized_percent = min(99, normalized_percent)

    occurred_at = datetime.now(timezone.utc)
    event = ProctoringEvent(
        attempt_id=attempt_id,
        event_type="VIDEO_UPLOAD_PROGRESS",
        severity=SeverityEnum.LOW,
        detail=f"Proctoring {source} video upload {status}",
        meta={
            "session_id": session_id,
            "source": source,
            "uploaded_bytes": uploaded_bytes,
            "total_bytes": total_bytes,
            "progress_percent": normalized_percent,
            "status": status,
            "created_at": occurred_at.isoformat(),
        },
        occurred_at=occurred_at,
    )
    db.add(event)
    db.commit()
    return Message(detail="Video upload progress recorded")


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


@router.get("/exam/{exam_id}/video-upload-status")
async def list_exam_video_upload_status(
    exam_id: str,
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("View Attempt Analysis", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR)),
):
    exam_pk = parse_uuid_param(exam_id, detail="Exam not found")
    attempts = list(
        db.scalars(
            select(Attempt)
            .where(Attempt.exam_id == exam_pk)
            .order_by(Attempt.created_at.desc())
        )
    )
    if not attempts:
        return []

    attempt_ids = [attempt.id for attempt in attempts]
    relevant_events = list(
        db.scalars(
            select(ProctoringEvent)
            .where(
                ProctoringEvent.attempt_id.in_(attempt_ids),
                ProctoringEvent.event_type.in_(("VIDEO_SAVED", "VIDEO_UPLOAD_PROGRESS")),
            )
            .order_by(ProctoringEvent.occurred_at.desc())
        )
    )

    saved_by_attempt: dict[str, dict[str, dict[str, object]]] = {}
    progress_by_attempt: dict[str, dict[str, dict[str, object]]] = {}
    for event in relevant_events:
        attempt_key = str(event.attempt_id)
        if event.event_type == "VIDEO_SAVED":
            item = _normalize_saved_video_meta(event.meta, event.occurred_at)
            if not item:
                continue
            source = _normalize_video_source(item.get("source"))
            saved_by_attempt.setdefault(attempt_key, {}).setdefault(source, item)
            continue
        if event.event_type == "VIDEO_UPLOAD_PROGRESS":
            item = _normalize_video_upload_progress_meta(event.meta, event.occurred_at)
            if not item:
                continue
            source = _normalize_video_source(item.get("source"))
            progress_by_attempt.setdefault(attempt_key, {}).setdefault(source, item)

    return [
        _build_attempt_video_upload_summary(
            attempt,
            saved_by_source=saved_by_attempt.get(str(attempt.id)),
            progress_by_source=progress_by_attempt.get(str(attempt.id)),
        )
        for attempt in attempts
    ]


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

    orchestrator = ProctoringOrchestrator(exam_cfg)

    # ── Register live monitoring session ──────────────────────────────────────
    _live_session_info[attempt_id] = {
        "attempt_id": attempt_id,
        "user_name": attempt.user.name if attempt.user else None,
        "user_id": str(attempt.user_id),
        "exam_title": attempt.exam.name if attempt.exam else None,
        "exam_id": str(attempt.exam_id),
        "started_at": attempt.started_at.isoformat() if attempt.started_at else None,
    }
    if attempt_id not in _live_viewers:
        _live_viewers[attempt_id] = set()

    # ── Model availability checks — run in background after orchestrator init ──
    # These are deferred so the WS connect handshake isn't blocked by model loading.
    async def _send_detection_status():
        try:
            face_model_ok = get_face_model() is not None
            # Check object model via the already-initialised orchestrator's detector
            obj_model_ok = orchestrator.object_detector._get_model() is not None

            if (exam_cfg.get("face_detection") or exam_cfg.get("multi_face")) and not face_model_ok:
                logger.error("Face detection model unavailable for attempt %s", attempt_id)
                await websocket.send_json({
                    "type": "error",
                    "detail": "Face detection model unavailable. Face and multiple-face alerts are disabled until the model is restored.",
                })
            if exam_cfg.get("object_detection") and not obj_model_ok:
                logger.error("Object detection model unavailable for attempt %s", attempt_id)
                await websocket.send_json({
                    "type": "error",
                    "detail": "Object detection model unavailable. Forbidden-object alerts (phone, book, etc.) are disabled until the model is restored.",
                })

            detection_status = {
                "face_detection": bool(exam_cfg.get("face_detection")) and face_model_ok,
                "multi_face": bool(exam_cfg.get("multi_face")) and face_model_ok,
                "object_detection": bool(exam_cfg.get("object_detection")) and obj_model_ok,
                "eye_tracking": bool(exam_cfg.get("eye_tracking")),
                "head_pose_detection": bool(exam_cfg.get("head_pose_detection")),
                "audio_detection": bool(exam_cfg.get("audio_detection")),
                "mouth_detection": bool(exam_cfg.get("mouth_detection")),
            }
            await websocket.send_json({"type": "detection_status", **detection_status})
        except Exception as exc:
            logger.debug("Could not send detection_status for attempt %s: %s", attempt_id, exc)
    last_activity = {"monotonic": time.monotonic()}

    async def heartbeat() -> None:
        consecutive_failures = 0
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
                consecutive_failures = 0
            except Exception:
                consecutive_failures += 1
                if consecutive_failures >= 3:
                    logger.warning("Heartbeat failed 3 consecutive times for attempt %s, exiting", attempt_id)
                    return

    heartbeat_task = asyncio.create_task(heartbeat())
    # Fire-and-forget: send detection status without blocking the message loop
    asyncio.create_task(_send_detection_status())

    # Append-through event cache: new events appended immediately after commit,
    # full DB refresh only every 60s to catch any events created outside this WS.
    _cached_events: list[ProctoringEvent] = []
    _cache_ts: float = 0.0
    _EVENT_CACHE_FULL_REFRESH_S = 60

    def _get_cached_events() -> list[ProctoringEvent]:
        nonlocal _cached_events, _cache_ts
        now = time.monotonic()
        if now - _cache_ts >= _EVENT_CACHE_FULL_REFRESH_S:
            try:
                _cached_events = _load_attempt_events(db, attempt.id)
                _cache_ts = now
            except Exception as cache_err:
                logger.warning("Failed to refresh event cache for attempt %s: %s", attempt_id, cache_err)
                try:
                    db.rollback()
                except Exception:
                    pass
        return list(_cached_events)

    def _append_cached_event(event: ProctoringEvent) -> None:
        """Append a newly created event to the cache without a full DB refresh."""
        _cached_events.append(event)

    _frame_proc_end = 0.0  # monotonic timestamp of last frame processing completion

    async def _async_db_commit():
        """Run db.commit() in executor to avoid blocking the event loop."""
        _loop = asyncio.get_running_loop()
        await _loop.run_in_executor(None, db.commit)

    # ── WebSocket rate limiting ──────────────────────────────────────
    _RATE_WINDOW_S = 5.0
    _RATE_GLOBAL_MAX = 30  # max messages per window across all types
    _RATE_TYPE_MAX = {"frame": 20, "audio": 10, "screen": 5, "client_event": 25}
    _rate_global_ts: list[float] = []
    _rate_type_ts: dict[str, list[float]] = {}

    def _rate_limit_ok(msg_type: str) -> bool:
        now_mono = time.monotonic()
        cutoff = now_mono - _RATE_WINDOW_S
        # Global check
        _rate_global_ts[:] = [t for t in _rate_global_ts if t > cutoff]
        if len(_rate_global_ts) >= _RATE_GLOBAL_MAX:
            return False
        # Per-type check
        type_max = _RATE_TYPE_MAX.get(msg_type)
        if type_max is not None:
            bucket = _rate_type_ts.setdefault(msg_type, [])
            bucket[:] = [t for t in bucket if t > cutoff]
            if len(bucket) >= type_max:
                return False
            bucket.append(now_mono)
        _rate_global_ts.append(now_mono)
        return True

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
                if websocket.application_state != WebSocketState.CONNECTED:
                    # WS is dead — break to avoid infinite tight loop
                    logger.info("WebSocket no longer connected for attempt %s, exiting loop", attempt_id)
                    break
                await websocket.send_json({"type": "error", "detail": "Malformed websocket message"})
                continue

            try:
                msg_type = data.get("type")

                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})
                    continue
                if msg_type == "pong":
                    continue

                if not _rate_limit_ok(msg_type or ""):
                    logger.warning("Rate limit exceeded for attempt %s, msg_type=%s", attempt_id, msg_type)
                    await websocket.send_json({"type": "error", "detail": "Rate limit exceeded"})
                    continue

                if msg_type == "frame":
                    b64 = data.get("data")
                    if not b64:
                        continue
                    # Gate: skip frames that were buffered during previous processing
                    _recv_mono = time.monotonic()
                    if _recv_mono - _frame_proc_end < 0.03:
                        logger.debug("Dropping buffered frame for attempt %s (%.0fms after last)", attempt_id, (_recv_mono - _frame_proc_end) * 1000)
                        continue
                    frame_bytes = base64.b64decode(b64)
                    # Run CPU-heavy detection in thread pool to avoid blocking event loop
                    loop = asyncio.get_event_loop()
                    _proc_start = time.monotonic()
                    alerts = await loop.run_in_executor(None, orchestrator.process_frame, frame_bytes)
                    _frame_proc_end = time.monotonic()
                    _proc_ms = (_frame_proc_end - _proc_start) * 1000
                    if _proc_ms > 500:
                        logger.warning("Slow frame processing for attempt %s: %.0fms, %d alerts", attempt_id, _proc_ms, len(alerts))
                        # Tell client to slow down frame capture to avoid queue buildup
                        try:
                            await websocket.send_json({
                                "type": "slow_mode",
                                "interval_ms": min(int(_proc_ms * 1.5), 5000),
                            })
                        except Exception:
                            pass
                    else:
                        logger.debug("Frame processed for attempt %s: %.0fms, %d alerts, score=%d", attempt_id, _proc_ms, len(alerts), orchestrator.violation_score)
                    if alerts:
                        logger.debug("Alerts: %s", [a.get("event_type") for a in alerts])
                    history_events = _get_cached_events()
                    integrations_config = _load_integrations_config(db)

                    # Collect serious events for post-commit notification
                    _serious_batch: list[ProctoringEvent] = []
                    _integration_batch: list[ProctoringEvent] = []
                    _frame_forced_submit = False

                    for alert in alerts:
                        severity = SEVERITY_MAP.get(alert.get("severity", "LOW"), SeverityEnum.LOW)
                        meta = alert.get("meta") or {}

                        # Save evidence screenshot for every alert (not just HIGH)
                        try:
                            evidence_path = await _save_evidence(attempt_id, frame_bytes, alert["event_type"])
                        except Exception as ev_err:
                            logger.warning("Evidence save failed for attempt %s: %s", attempt_id, ev_err)
                            evidence_path = None
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
                        _append_cached_event(event)
                        history_events.append(event)
                        rule_result = _apply_alert_rules(
                            db,
                            attempt,
                            exam_cfg,
                            event,
                            history_events,
                            event_time,
                            request_ip=get_websocket_ip(websocket),
                        )

                        # Collect for post-commit processing (no per-alert commit)
                        if _is_serious_alert(alert.get("severity"), severity):
                            _serious_batch.append(event)
                        for escalated_event in rule_result["created_events"]:
                            _serious_batch.append(escalated_event)
                        _integration_batch.append(event)
                        _integration_batch.extend(rule_result["created_events"])

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
                            _frame_forced_submit = True
                            await websocket.send_json({"type": "forced_submit", "detail": rule_result["submit_reason"] or ""})
                            break

                    # Broadcast frame thumbnail + alerts to live admin viewers
                    if _live_viewers.get(attempt_id):
                        # Send a small thumbnail (max 320px wide) to save bandwidth
                        try:
                            import cv2 as _live_cv2
                            import numpy as _live_np
                            _np_arr = _live_np.frombuffer(frame_bytes, _live_np.uint8)
                            _frame_img = _live_cv2.imdecode(_np_arr, _live_cv2.IMREAD_COLOR)
                            if _frame_img is not None:
                                _h, _w = _frame_img.shape[:2]
                                if _w > 320:
                                    _scale = 320 / _w
                                    _frame_img = _live_cv2.resize(_frame_img, (320, int(_h * _scale)))
                                _, _thumb_buf = _live_cv2.imencode('.jpg', _frame_img, [_live_cv2.IMWRITE_JPEG_QUALITY, 50])
                                _thumb_bytes = _thumb_buf.tobytes()
                                _live_latest_thumb[attempt_id] = _thumb_bytes
                                await _broadcast_bytes_to_viewers(attempt_id, _thumb_bytes, "frame")
                        except Exception:
                            pass
                        for alert in alerts:
                            await _broadcast_to_viewers(attempt_id, {
                                "type": "alert",
                                "attempt_id": attempt_id,
                                "event_type": alert["event_type"],
                                "severity": alert["severity"],
                                "detail": alert.get("detail", ""),
                                "confidence": alert.get("confidence", 0),
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                            })
                        if alerts or orchestrator.face_checks % 10 == 0:
                            await _broadcast_to_viewers(attempt_id, {
                                "type": "live_summary",
                                "attempt_id": attempt_id,
                                **orchestrator.get_summary(),
                            })

                    # Single commit for all events from this frame
                    if alerts:
                        try:
                            await _async_db_commit()
                        except Exception as commit_err:
                            logger.warning("DB commit failed for frame alerts (attempt %s): %s", attempt_id, commit_err)
                            try:
                                db.rollback()
                            except Exception:
                                pass
                    # Post-commit: notifications & integrations
                    for _evt in _serious_batch:
                        _handle_serious_proctoring_event(db, attempt, _evt)
                    for _evt in _integration_batch:
                        try:
                            await send_proctoring_integration_event(_evt, integrations_config)
                        except Exception:
                            pass

                    # Send summary every 5th frame or when alerts fired (reduces WS traffic)
                    if alerts or orchestrator.face_checks % 5 == 0:
                        summary = orchestrator.get_summary()
                        await websocket.send_json({"type": "summary", "precheck_passed": bool(attempt.precheck_passed_at), **summary})
                    if attempt.status == AttemptStatus.SUBMITTED:
                        break
                    reason = _maybe_auto_submit_from_history(
                        db,
                        attempt,
                        exam_cfg,
                        history_events,
                        occurred_at=datetime.now(timezone.utc),
                        request_ip=get_websocket_ip(websocket),
                        violation_score=orchestrator.violation_score,
                    )
                    if reason:
                        await websocket.send_json({"type": "forced_submit", "detail": reason})
                        break
                    continue

                if msg_type == "audio":
                    b64 = data.get("data")
                    if not b64:
                        continue
                    audio_bytes = base64.b64decode(b64)
                    _sr = data.get("sample_rate")
                    logger.info("WS audio chunk for attempt %s (bytes=%d, sr=%s)", attempt_id, len(audio_bytes), _sr)
                    _audio_loop = asyncio.get_running_loop()
                    alerts = await _audio_loop.run_in_executor(
                        None, lambda: orchestrator.process_audio(audio_bytes, sample_rate=int(_sr) if _sr else None)
                    )
                    if alerts:
                        logger.debug("Audio alerts: %s", [a.get("event_type") for a in alerts])
                    history_events = _get_cached_events()

                    _audio_serious: list[ProctoringEvent] = []

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
                        _append_cached_event(event)
                        history_events.append(event)
                        rule_result = _apply_alert_rules(
                            db,
                            attempt,
                            exam_cfg,
                            event,
                            history_events,
                            event_time,
                            request_ip=get_websocket_ip(websocket),
                        )

                        if _is_serious_alert(alert.get("severity"), severity):
                            _audio_serious.append(event)
                        for escalated_event in rule_result["created_events"]:
                            _audio_serious.append(escalated_event)

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

                    if alerts:
                        try:
                            await _async_db_commit()
                        except Exception as commit_err:
                            logger.warning("DB commit failed for audio alerts (attempt %s): %s", attempt_id, commit_err)
                            try:
                                db.rollback()
                            except Exception:
                                pass
                    for _evt in _audio_serious:
                        _handle_serious_proctoring_event(db, attempt, _evt)

                    summary = orchestrator.get_summary()
                    await websocket.send_json({"type": "summary", **summary})
                    if attempt.status == AttemptStatus.SUBMITTED:
                        break
                    reason = _maybe_auto_submit_from_history(
                        db,
                        attempt,
                        exam_cfg,
                        history_events,
                        occurred_at=datetime.now(timezone.utc),
                        request_ip=get_websocket_ip(websocket),
                        violation_score=orchestrator.violation_score,
                    )
                    if reason:
                        await websocket.send_json({"type": "forced_submit", "detail": reason})
                        break
                    continue

                if msg_type == "screen":
                    b64 = data.get("data")
                    if not b64:
                        continue
                    frame_bytes = base64.b64decode(b64)
                    try:
                        await _save_evidence(attempt_id, frame_bytes, "SCREEN")
                    except Exception as ev_err:
                        logger.warning("Screen evidence save failed for attempt %s: %s", attempt_id, ev_err)
                    # OCR analysis for forbidden content (runs in executor to avoid blocking)
                    try:
                        import asyncio as _asyncio
                        screen_alert = await _asyncio.get_event_loop().run_in_executor(
                            None, analyze_screen_bytes, frame_bytes
                        )
                        if screen_alert:
                            severity = SEVERITY_MAP.get(screen_alert.get("severity", "HIGH"), SeverityEnum.HIGH)
                            event_time = datetime.now(timezone.utc)
                            event = ProctoringEvent(
                                attempt_id=attempt_id,
                                event_type=screen_alert["event_type"],
                                severity=severity,
                                detail=screen_alert.get("detail"),
                                ai_confidence=screen_alert.get("confidence"),
                                meta=screen_alert.get("meta"),
                                occurred_at=event_time,
                            )
                            db.add(event)
                            _append_cached_event(event)
                            try:
                                await _async_db_commit()
                            except Exception as commit_err:
                                logger.warning("DB commit failed for screen alert (attempt %s): %s", attempt_id, commit_err)
                                try:
                                    db.rollback()
                                except Exception:
                                    pass
                            await websocket.send_json({
                                "type": "alert",
                                "event_type": screen_alert["event_type"],
                                "severity": screen_alert["severity"],
                                "detail": screen_alert.get("detail", ""),
                                "confidence": screen_alert.get("confidence", 0),
                            })
                            screen_history = _get_cached_events()
                            reason = _maybe_auto_submit_from_history(
                                db,
                                attempt,
                                exam_cfg,
                                screen_history,
                                occurred_at=event_time,
                                request_ip=get_websocket_ip(websocket),
                            )
                            if reason:
                                await websocket.send_json({"type": "forced_submit", "detail": reason})
                                break
                    except Exception as _se:
                        logger.debug("Screen OCR analysis error for attempt %s: %s", attempt_id, _se)
                    continue

                if msg_type == "answer_timing":
                    # Frontend reports time-per-question; flag suspiciously fast answers.
                    # Payload: {question_id, elapsed_ms, question_index}
                    elapsed_ms = int(data.get("elapsed_ms") or 0)
                    q_index = int(data.get("question_index") or 0) + 1
                    q_id = str(data.get("question_id") or "")[:64]
                    FAST_ANSWER_THRESHOLD_MS = 3000  # < 3 s is almost certainly random
                    if elapsed_ms > 0 and elapsed_ms < FAST_ANSWER_THRESHOLD_MS:
                        sev = SeverityEnum.MEDIUM
                        detail = (
                            f"Question {q_index} answered in {elapsed_ms} ms "
                            f"(threshold: {FAST_ANSWER_THRESHOLD_MS} ms)"
                        )
                        event = ProctoringEvent(
                            attempt_id=attempt_id,
                            event_type="FAST_ANSWER",
                            severity=sev,
                            detail=detail,
                            ai_confidence=0.85,
                            occurred_at=datetime.now(timezone.utc),
                            meta={"question_id": q_id, "elapsed_ms": elapsed_ms},
                        )
                        db.add(event)
                        _append_cached_event(event)
                        try:
                            await _async_db_commit()
                        except Exception as commit_err:
                            logger.warning("DB commit failed for FAST_ANSWER (attempt %s): %s", attempt_id, commit_err)
                            try:
                                db.rollback()
                            except Exception:
                                pass
                        await websocket.send_json({
                            "type": "alert",
                            "event_type": "FAST_ANSWER",
                            "severity": "MEDIUM",
                            "detail": detail,
                            "confidence": 0.85,
                        })
                        history_events = _get_cached_events()
                        reason = _maybe_auto_submit_from_history(
                            db,
                            attempt,
                            exam_cfg,
                            history_events,
                            occurred_at=event.occurred_at,
                            request_ip=get_websocket_ip(websocket),
                        )
                        if reason:
                            await websocket.send_json({"type": "forced_submit", "detail": reason})
                            break
                    continue

                if msg_type == "keystroke_anomaly":
                    # Frontend reports suspiciously fast inter-key intervals (avg < 50 ms).
                    # Payload: {avg_interval_ms, sample_size}
                    avg_ms = float(data.get("avg_interval_ms") or 0)
                    samples = int(data.get("sample_size") or 0)
                    if avg_ms > 0 and samples >= 5:
                        detail = (
                            f"Abnormal keystroke cadence: avg {avg_ms:.0f} ms between keys "
                            f"({samples} keystrokes) — possible auto-fill or macro"
                        )
                        event = ProctoringEvent(
                            attempt_id=attempt_id,
                            event_type="KEYSTROKE_ANOMALY",
                            severity=SeverityEnum.MEDIUM,
                            detail=detail,
                            ai_confidence=0.80,
                            occurred_at=datetime.now(timezone.utc),
                            meta={"avg_interval_ms": avg_ms, "sample_size": samples},
                        )
                        db.add(event)
                        _append_cached_event(event)
                        try:
                            await _async_db_commit()
                        except Exception as commit_err:
                            logger.warning("DB commit failed for KEYSTROKE_ANOMALY (attempt %s): %s", attempt_id, commit_err)
                            try:
                                db.rollback()
                            except Exception:
                                pass
                        await websocket.send_json({
                            "type": "alert",
                            "event_type": "KEYSTROKE_ANOMALY",
                            "severity": "MEDIUM",
                            "detail": detail,
                            "confidence": 0.80,
                        })
                        history_events = _get_cached_events()
                        reason = _maybe_auto_submit_from_history(
                            db,
                            attempt,
                            exam_cfg,
                            history_events,
                            occurred_at=event.occurred_at,
                            request_ip=get_websocket_ip(websocket),
                        )
                        if reason:
                            await websocket.send_json({"type": "forced_submit", "detail": reason})
                            break
                    continue

                if msg_type == "client_event":
                    # Browser-level violation sent directly by the frontend
                    # (copy/paste, keyboard shortcuts, tab switch, fullscreen exit, etc.)
                    ce_type = str(data.get("event_type") or "BROWSER_EVENT").upper()[:64]
                    ce_sev_str = str(data.get("severity") or "MEDIUM").upper()
                    ce_detail = str(data.get("detail") or "Browser-level proctoring event")[:500]
                    ce_severity = SEVERITY_MAP.get(ce_sev_str, SeverityEnum.MEDIUM)
                    event_time = datetime.now(timezone.utc)
                    event = ProctoringEvent(
                        attempt_id=attempt_id,
                        event_type=ce_type,
                        severity=ce_severity,
                        detail=ce_detail,
                        ai_confidence=0.99,
                        occurred_at=event_time,
                    )
                    db.add(event)
                    _append_cached_event(event)
                    history_events = _get_cached_events()
                    history_events.append(event)
                    rule_result = _apply_alert_rules(
                        db, attempt, exam_cfg, event, history_events,
                        event_time, request_ip=get_websocket_ip(websocket),
                    )
                    try:
                        await _async_db_commit()
                    except Exception as commit_err:
                        logger.warning("DB commit failed for client_event (attempt %s): %s", attempt_id, commit_err)
                        try:
                            db.rollback()
                        except Exception:
                            pass
                    if _is_serious_alert(ce_sev_str, ce_severity):
                        _handle_serious_proctoring_event(db, attempt, event)
                    for escalated_event in rule_result["created_events"]:
                        _handle_serious_proctoring_event(db, attempt, escalated_event)
                    await websocket.send_json({
                        "type": "alert",
                        "event_type": ce_type,
                        "severity": ce_sev_str,
                        "detail": ce_detail,
                        "confidence": 0.99,
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
                    reason = _maybe_auto_submit_from_history(
                        db,
                        attempt,
                        exam_cfg,
                        history_events,
                        occurred_at=event_time,
                        request_ip=get_websocket_ip(websocket),
                    )
                    if reason:
                        await websocket.send_json({"type": "forced_submit", "detail": reason})
                        break
                    continue
            except Exception as exc:
                logger.exception("Failed to process websocket message for attempt %s: %s", attempt_id, exc)
                try:
                    db.rollback()
                except Exception:
                    pass
                if websocket.application_state == WebSocketState.CONNECTED:
                    err_detail = str(exc)[:300] if str(exc) else "Unknown processing error"
                    try:
                        await websocket.send_json({
                            "type": "error",
                            "detail": f"Detection processing failed: {err_detail}",
                        })
                    except Exception:
                        pass

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
        # Flush any uncommitted events before closing
        try:
            db.commit()
        except Exception:
            with contextlib.suppress(Exception):
                db.rollback()
        # Clean up live monitoring session
        _live_session_info.pop(attempt_id, None)
        _live_latest_thumb.pop(attempt_id, None)
        # Notify admin viewers that session ended, then close their connections
        await _broadcast_to_viewers(attempt_id, {"type": "session_ended", "attempt_id": attempt_id})
        _live_viewers.pop(attempt_id, None)
        # Notify client of graceful close
        if websocket.application_state == WebSocketState.CONNECTED:
            with contextlib.suppress(Exception):
                await websocket.send_json({"type": "server_shutdown"})
                await websocket.close(code=1001)
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
