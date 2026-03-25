from __future__ import annotations

import logging
from typing import Any

from celery.result import AsyncResult

from ..core.celery_app import celery_app
from ..core.config import get_settings
from ..tasks.proctoring_video import process_uploaded_proctoring_video

logger = logging.getLogger(__name__)


def video_batch_analysis_enabled() -> bool:
    settings = get_settings()
    return bool(
        settings.PROCTORING_BATCH_ANALYSIS_ENABLED
        and settings.celery_broker_url
        and settings.celery_result_backend
    )


def enqueue_video_batch_analysis(attempt_id: str, file_info: dict[str, Any]) -> dict[str, Any] | None:
    if not video_batch_analysis_enabled():
        return None

    task = process_uploaded_proctoring_video.apply_async(
        kwargs={"attempt_id": str(attempt_id), "file_info": dict(file_info or {})},
        queue="proctoring-batch",
    )
    return {
        "job_id": str(task.id),
        "status": "QUEUED",
        "detail": "Batch video analysis queued.",
    }


def get_video_batch_job_status(job_id: str) -> dict[str, Any]:
    result = AsyncResult(str(job_id), app=celery_app)
    try:
        state = str(result.state or "PENDING").upper()
    except Exception as exc:
        logger.warning("Failed to read batch job %s status: %s", job_id, exc)
        return {
            "job_id": str(job_id),
            "status": "PROCESSING",
            "detail": "Batch video analysis status is temporarily unavailable.",
            "findings": [],
            "summary": {},
            "file": None,
            "completed_at": None,
        }

    if state in {"SUCCESS"}:
        payload = result.result if isinstance(result.result, dict) else {}
        return {
            "job_id": str(job_id),
            "status": str(payload.get("status") or "COMPLETED").upper(),
            "detail": str(payload.get("detail") or "Batch video analysis completed."),
            "findings": list(payload.get("findings") or []),
            "summary": dict(payload.get("summary") or {}),
            "file": payload.get("file"),
            "completed_at": payload.get("completed_at"),
        }

    if state in {"FAILURE", "REVOKED"}:
        detail = str(result.result)[:500] if result.result is not None else "Batch video analysis failed."
        return {
            "job_id": str(job_id),
            "status": "FAILED",
            "detail": detail,
            "findings": [],
            "summary": {},
            "file": None,
            "completed_at": None,
        }

    mapped_status = "PROCESSING" if state in {"STARTED", "RETRY"} else "QUEUED"
    return {
        "job_id": str(job_id),
        "status": mapped_status,
        "detail": "Batch video analysis is still running." if mapped_status == "PROCESSING" else "Batch video analysis is queued.",
        "findings": [],
        "summary": {},
        "file": None,
        "completed_at": None,
    }
