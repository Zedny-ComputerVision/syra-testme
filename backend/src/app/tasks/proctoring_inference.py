from __future__ import annotations

import base64
import contextlib
import logging
import threading
import uuid
from typing import Any

from celery.signals import worker_process_init, worker_process_shutdown
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from ..core.celery_app import celery_app
from ..core.config import get_settings
from ..db.session import SessionLocal
from ..models import Attempt, ProctoringEvent
from ..services.proctoring_inference import get_proctoring_inference_store, warm_inference_models

logger = logging.getLogger(__name__)
settings = get_settings()
store = get_proctoring_inference_store()
_worker_models_ready = False
_worker_models_lock = threading.Lock()


def _ensure_worker_models_ready() -> None:
    global _worker_models_ready
    if _worker_models_ready:
        return
    with _worker_models_lock:
        if _worker_models_ready:
            return
        warm_inference_models()
        _worker_models_ready = True
        logger.info("Celery inference worker models are warmed and ready")


def _parse_attempt_id(attempt_id: str) -> uuid.UUID:
    return uuid.UUID(str(attempt_id).strip())


def _load_attempt_runtime_context(attempt_id: str) -> tuple[dict[str, Any], float]:
    parsed_attempt_id = _parse_attempt_id(attempt_id)
    with SessionLocal() as db:
        attempt = db.scalar(
            select(Attempt)
            .options(selectinload(Attempt.exam))
            .where(Attempt.id == parsed_attempt_id)
        )
        if attempt is None or attempt.exam is None:
            raise KeyError(f"Proctoring inference session not found for attempt {attempt_id}")

        exam_cfg = dict(attempt.exam.proctoring_config or {})
        if getattr(attempt, "face_signature", None):
            exam_cfg["face_signature"] = attempt.face_signature

        score_weights = exam_cfg.get("violation_weights") or {"HIGH": 3, "MEDIUM": 2, "LOW": 1}
        historical_violation_score = 0.0
        previous_events = db.scalars(
            select(ProctoringEvent).where(ProctoringEvent.attempt_id == parsed_attempt_id)
        ).all()
        for event in previous_events:
            severity_name = event.severity.value if hasattr(event.severity, "value") else str(event.severity or "LOW")
            historical_violation_score += float(score_weights.get(str(severity_name).upper(), 1))

    return exam_cfg, historical_violation_score


def _restore_missing_session(attempt_id: str) -> None:
    exam_cfg, historical_violation_score = _load_attempt_runtime_context(attempt_id)
    store.open_session(
        attempt_id,
        exam_cfg,
        initial_violation_score=historical_violation_score,
    )


def _run_with_restored_session(attempt_id: str, callback):
    _ensure_worker_models_ready()
    try:
        return callback()
    except KeyError:
        logger.warning("Inference worker session missing for attempt %s. Reconstructing from database.", attempt_id)
        _restore_missing_session(attempt_id)
        return callback()


def _decode_payload(encoded_payload: str, *, label: str) -> bytes:
    normalized = str(encoded_payload or "").strip()
    if not normalized:
        raise ValueError(f"{label} payload is required")
    return base64.b64decode(normalized)


@worker_process_init.connect
def _warm_worker_models_on_start(**_: Any) -> None:
    with contextlib.suppress(Exception):
        _ensure_worker_models_ready()


@worker_process_shutdown.connect
def _close_worker_sessions_on_shutdown(**_: Any) -> None:
    with contextlib.suppress(Exception):
        store.close_all()


@celery_app.task(
    name="proctoring.open_session",
    queue=settings.PROCTORING_INFERENCE_QUEUE,
)
def open_proctoring_session_task(
    attempt_id: str,
    exam_cfg: dict[str, Any] | None = None,
    initial_violation_score: float = 0.0,
) -> dict[str, Any]:
    _ensure_worker_models_ready()
    response = store.open_session(
        str(attempt_id),
        dict(exam_cfg or {}),
        initial_violation_score=float(initial_violation_score or 0.0),
    )
    return response.model_dump(mode="json")


@celery_app.task(
    name="proctoring.process_frame",
    queue=settings.PROCTORING_INFERENCE_QUEUE,
)
def process_proctoring_frame_task(attempt_id: str, frame_b64: str) -> dict[str, Any]:
    frame_bytes = _decode_payload(frame_b64, label="frame")
    result = _run_with_restored_session(
        str(attempt_id),
        lambda: store.process_frame(str(attempt_id), frame_bytes),
    )
    return result.model_dump(mode="json")


@celery_app.task(
    name="proctoring.process_audio",
    queue=settings.PROCTORING_INFERENCE_QUEUE,
)
def process_proctoring_audio_task(
    attempt_id: str,
    audio_b64: str,
    sample_rate: int | None = None,
) -> dict[str, Any]:
    audio_bytes = _decode_payload(audio_b64, label="audio")
    result = _run_with_restored_session(
        str(attempt_id),
        lambda: store.process_audio(str(attempt_id), audio_bytes, sample_rate=sample_rate),
    )
    return result.model_dump(mode="json")


@celery_app.task(
    name="proctoring.process_screen",
    queue=settings.PROCTORING_INFERENCE_QUEUE,
)
def process_proctoring_screen_task(attempt_id: str, frame_b64: str) -> dict[str, Any]:
    frame_bytes = _decode_payload(frame_b64, label="screen")
    result = _run_with_restored_session(
        str(attempt_id),
        lambda: store.process_screen(str(attempt_id), frame_bytes),
    )
    return result.model_dump(mode="json")


@celery_app.task(
    name="proctoring.close_session",
    queue=settings.PROCTORING_INFERENCE_QUEUE,
)
def close_proctoring_session_task(attempt_id: str) -> None:
    _ensure_worker_models_ready()
    store.close_session(str(attempt_id))
