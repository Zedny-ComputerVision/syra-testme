from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Mapping
from datetime import datetime, timezone
from typing import Any

from celery import Task

from ..core.celery_app import celery_app
from ..db.session import SessionLocal
from ..models import ProctoringEvent, SeverityEnum
from ..services.cloudflare_media import get_cloudflare_video_details

logger = logging.getLogger(__name__)

_CLOUDFLARE_REFRESH_ATTEMPTS = 6
_CLOUDFLARE_REFRESH_DELAY_SECONDS = 5
_INVALID_VIDEO_STATUSES = {"error", "failed"}


def _safe_int(value: object, default: int = 0) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _safe_float(value: object, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _normalize_file_info(file_info: Mapping[str, Any] | None) -> dict[str, Any]:
    data = dict(file_info or {})
    return {
        **data,
        "provider": str(data.get("provider") or "").strip().lower(),
        "source": str(data.get("source") or "camera").strip().lower() or "camera",
        "session_id": str(data.get("session_id") or "").strip(),
        "name": str(data.get("name") or "").strip(),
        "uid": str(data.get("uid") or "").strip(),
        "status": str(data.get("status") or "").strip().lower(),
        "size": max(0, _safe_int(data.get("size"))),
        "duration": _safe_float(data.get("duration"), 0.0),
        "ready_to_stream": bool(data.get("ready_to_stream")),
    }


def _refresh_cloudflare_info(file_info: dict[str, Any]) -> dict[str, Any]:
    current = dict(file_info)
    uid = str(current.get("uid") or "").strip()
    name = str(current.get("name") or "").strip()
    source = str(current.get("source") or "camera").strip().lower() or "camera"
    size = max(0, _safe_int(current.get("size")))

    for attempt in range(_CLOUDFLARE_REFRESH_ATTEMPTS):
        try:
            refreshed = asyncio.run(
                get_cloudflare_video_details(
                    uid=uid or None,
                    filename=name or None,
                    source=source,
                    fallback_size=size,
                )
            )
        except Exception as exc:
            logger.warning("Cloudflare metadata refresh failed for %s: %s", uid or name or source, exc)
            break

        if refreshed:
            current.update(refreshed)
            current = _normalize_file_info(current)
            if current.get("ready_to_stream"):
                return current
        if attempt < _CLOUDFLARE_REFRESH_ATTEMPTS - 1:
            time.sleep(_CLOUDFLARE_REFRESH_DELAY_SECONDS)
    return current


def _build_findings(file_info: dict[str, Any]) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    provider = str(file_info.get("provider") or "").strip().lower()
    source = str(file_info.get("source") or "camera").strip().lower() or "camera"
    status = str(file_info.get("status") or "").strip().lower()
    size = max(0, _safe_int(file_info.get("size")))
    duration = _safe_float(file_info.get("duration"), 0.0)
    ready_to_stream = bool(file_info.get("ready_to_stream"))

    if status in _INVALID_VIDEO_STATUSES:
        findings.append({
            "code": "VIDEO_STREAM_ERROR",
            "severity": "MEDIUM",
            "detail": f"{source.title()} recording upload reached storage, but playback processing failed.",
        })
    elif size <= 0:
        findings.append({
            "code": "VIDEO_UPLOAD_EMPTY",
            "severity": "MEDIUM",
            "detail": f"{source.title()} recording uploaded with zero bytes.",
        })
    else:
        findings.append({
            "code": "VIDEO_UPLOAD_CAPTURED",
            "severity": "LOW",
            "detail": f"{source.title()} recording captured successfully ({size} bytes).",
        })

    if duration > 0 and duration < 5:
        findings.append({
            "code": "VIDEO_DURATION_SHORT",
            "severity": "LOW",
            "detail": f"{source.title()} recording is short ({duration:.1f}s).",
        })

    if provider == "cloudflare":
        if status in _INVALID_VIDEO_STATUSES:
            findings.append({
                "code": "VIDEO_STREAM_UNAVAILABLE",
                "severity": "MEDIUM",
                "detail": f"{source.title()} Cloudflare stream is unavailable because processing failed.",
            })
        else:
            findings.append({
                "code": "VIDEO_STREAM_READY" if ready_to_stream else "VIDEO_TRANSCODING_PENDING",
                "severity": "LOW",
                "detail": (
                    f"{source.title()} Cloudflare stream is ready for playback."
                    if ready_to_stream
                    else f"{source.title()} Cloudflare stream is still processing."
                ),
            })

    return findings


def _build_summary(file_info: dict[str, Any], findings: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "provider": file_info.get("provider"),
        "source": file_info.get("source"),
        "session_id": file_info.get("session_id"),
        "size_bytes": max(0, _safe_int(file_info.get("size"))),
        "duration_seconds": _safe_float(file_info.get("duration"), 0.0),
        "ready_to_stream": bool(file_info.get("ready_to_stream")),
        "playback_type": file_info.get("playback_type"),
        "finding_count": len(findings),
    }


def _event_severity(findings: list[dict[str, Any]]) -> SeverityEnum:
    severities = {str(item.get("severity") or "").upper() for item in findings}
    if "MEDIUM" in severities or "HIGH" in severities or "CRITICAL" in severities:
        return SeverityEnum.MEDIUM
    return SeverityEnum.LOW


def _record_event(
    *,
    attempt_id: str,
    event_type: str,
    severity: SeverityEnum,
    detail: str,
    meta: dict[str, Any],
) -> None:
    db = SessionLocal()
    try:
        event = ProctoringEvent(
            attempt_id=attempt_id,
            event_type=event_type,
            severity=severity,
            detail=detail,
            meta=meta,
            occurred_at=datetime.now(timezone.utc),
        )
        db.add(event)
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning("Failed to record %s event for attempt %s: %s", event_type, attempt_id, exc)
    finally:
        db.close()


@celery_app.task(
    bind=True,
    name="process_uploaded_proctoring_video",
    queue="proctoring-batch",
)
def process_uploaded_proctoring_video(self: Task, attempt_id: str, file_info: dict[str, Any]) -> dict[str, Any]:
    job_id = str(self.request.id or "")
    normalized_file = _normalize_file_info(file_info)

    try:
        if normalized_file.get("provider") == "cloudflare":
            normalized_file = _refresh_cloudflare_info(normalized_file)

        findings = _build_findings(normalized_file)
        summary = _build_summary(normalized_file, findings)
        result = {
            "job_id": job_id,
            "status": "COMPLETED",
            "detail": "Batch video analysis completed.",
            "session_id": normalized_file.get("session_id"),
            "source": normalized_file.get("source"),
            "findings": findings,
            "summary": summary,
            "file": normalized_file,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }

        _record_event(
            attempt_id=attempt_id,
            event_type="VIDEO_BATCH_ANALYSIS_COMPLETED",
            severity=_event_severity(findings),
            detail=f"Batch analysis completed for {normalized_file.get('source', 'video')} recording",
            meta=result,
        )
        return result
    except Exception as exc:
        logger.exception("Batch analysis failed for attempt %s: %s", attempt_id, exc)
        failure = {
            "job_id": job_id,
            "status": "FAILED",
            "detail": str(exc)[:500] or "Batch analysis failed.",
            "session_id": normalized_file.get("session_id"),
            "source": normalized_file.get("source"),
            "findings": [],
            "summary": {
                "provider": normalized_file.get("provider"),
                "source": normalized_file.get("source"),
                "session_id": normalized_file.get("session_id"),
            },
            "file": normalized_file,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }
        _record_event(
            attempt_id=attempt_id,
            event_type="VIDEO_BATCH_ANALYSIS_FAILED",
            severity=SeverityEnum.MEDIUM,
            detail=f"Batch analysis failed for {normalized_file.get('source', 'video')} recording",
            meta=failure,
        )
        raise
