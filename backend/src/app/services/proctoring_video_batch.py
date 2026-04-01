from __future__ import annotations

import logging
from collections.abc import Mapping
from typing import Any

from celery.result import AsyncResult

from ..core.celery_app import celery_app
from ..core.i18n import translate as _t
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


def video_job_queue_enabled() -> bool:
    settings = get_settings()
    return bool(settings.celery_broker_url and settings.celery_result_backend)


def _build_job_status_payload(
    job_id: str,
    *,
    result: AsyncResult,
    queued_detail: str,
    processing_detail: str,
    completed_detail: str,
) -> dict[str, Any]:
    try:
        state = str(result.state or "PENDING").upper()
    except Exception as exc:
        logger.warning("Failed to read job %s status: %s", job_id, exc)
        return {
            "job_id": str(job_id),
            "status": "PROCESSING",
            "detail": processing_detail,
            "findings": [],
            "summary": {},
            "file": None,
            "completed_at": None,
        }

    if state == "SUCCESS":
        payload = result.result if isinstance(result.result, Mapping) else {}
        return {
            "job_id": str(job_id),
            "status": str(payload.get("status") or "COMPLETED").upper(),
            "detail": str(payload.get("detail") or completed_detail),
            "findings": list(payload.get("findings") or []),
            "summary": dict(payload.get("summary") or {}),
            "file": payload.get("file"),
            "completed_at": payload.get("completed_at"),
        }

    if state in {"FAILURE", "REVOKED"}:
        detail = str(result.result)[:500] if result.result is not None else "Video processing failed."
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
        "detail": processing_detail if mapped_status == "PROCESSING" else queued_detail,
        "findings": [],
        "summary": {},
        "file": None,
        "completed_at": None,
    }


def get_proctoring_video_job_status(job_id: str) -> dict[str, Any]:
    result = AsyncResult(str(job_id), app=celery_app)
    return _build_job_status_payload(
        str(job_id),
        result=result,
        queued_detail=_t("video_processing_queued"),
        processing_detail=_t("video_processing_running"),
        completed_detail=_t("video_processing_completed"),
    )


def get_video_batch_job_status(job_id: str) -> dict[str, Any]:
    result = AsyncResult(str(job_id), app=celery_app)
    return _build_job_status_payload(
        str(job_id),
        result=result,
        queued_detail=_t("batch_analysis_queued"),
        processing_detail=_t("batch_analysis_running"),
        completed_detail=_t("batch_analysis_completed"),
    )
