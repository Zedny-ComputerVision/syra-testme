from __future__ import annotations

import asyncio
import base64
import contextlib
import logging
import threading
import time
from collections.abc import Mapping
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any

import httpx
from celery.exceptions import TimeoutError as CeleryTimeoutError
from pydantic import BaseModel, Field

from ..core.config import get_settings

logger = logging.getLogger(__name__)


class SessionOpenResponse(BaseModel):
    detection_status: dict[str, bool] = Field(default_factory=dict)
    summary: dict[str, Any] = Field(default_factory=dict)
    face_checks: int = 0
    violation_score: float = 0.0


class InferenceResult(BaseModel):
    alerts: list[dict[str, Any]] = Field(default_factory=list)
    summary: dict[str, Any] = Field(default_factory=dict)
    face_checks: int = 0
    violation_score: float = 0.0
    latency_ms: float = 0.0


@dataclass
class InferenceSession:
    orchestrator: Any
    lock: threading.Lock = field(default_factory=threading.Lock)


def _get_face_model() -> Any:
    from ..detection._yolo_face import get_face_model

    return get_face_model()


def _prewarm_shared_mesh() -> None:
    from ..detection.orchestrator import prewarm_shared_mesh

    prewarm_shared_mesh()


def _create_orchestrator(exam_cfg: Mapping[str, Any]) -> Any:
    from ..detection.orchestrator import ProctoringOrchestrator

    return ProctoringOrchestrator(dict(exam_cfg or {}))


def _analyze_screen_frame(frame_bytes: bytes) -> dict[str, Any] | None:
    from ..detection.screen_analysis import analyze_screen_bytes

    return analyze_screen_bytes(frame_bytes)


def warm_inference_models() -> dict[str, bool]:
    status = {
        "face_detection": False,
        "multi_face": False,
        "object_detection": False,
        "eye_tracking": True,
        "head_pose_detection": True,
        "audio_detection": True,
        "mouth_detection": True,
    }

    try:
        model = _get_face_model()
        status["face_detection"] = model is not None
        status["multi_face"] = model is not None
        if model is not None:
            logger.info("YOLO face model pre-warmed successfully")
        else:
            logger.warning("YOLO face model not available for pre-warming")
    except Exception as exc:
        logger.warning("Failed to pre-warm YOLO face model: %s", exc)

    try:
        from ..detection.object_detection import preload as preload_object_model

        preload_object_model()
        status["object_detection"] = True
        logger.info("YOLO object model pre-warmed successfully")
    except Exception as exc:
        logger.warning("Failed to pre-warm YOLO object model: %s", exc)

    try:
        _prewarm_shared_mesh()
    except Exception as exc:
        logger.warning("Failed to pre-warm MediaPipe FaceMesh: %s", exc)

    return status


class ProctoringInferenceStore:
    def __init__(self) -> None:
        self._sessions: dict[str, InferenceSession] = {}
        self._lock = threading.RLock()

    def open_session(
        self,
        attempt_id: str,
        exam_cfg: Mapping[str, Any] | None = None,
        *,
        initial_violation_score: float = 0.0,
    ) -> SessionOpenResponse:
        attempt_key = str(attempt_id)
        config = dict(exam_cfg or {})
        orchestrator = _create_orchestrator(config)
        orchestrator.violation_score = float(initial_violation_score or 0.0)
        session = InferenceSession(orchestrator=orchestrator)

        previous: InferenceSession | None = None
        with self._lock:
            previous = self._sessions.get(attempt_key)
            self._sessions[attempt_key] = session

        if previous is not None:
            self._close_session(previous)

        detection_status = self._build_detection_status(session.orchestrator, config)
        summary = session.orchestrator.get_summary()
        return SessionOpenResponse(
            detection_status=detection_status,
            summary=summary,
            face_checks=int(summary.get("face_checks") or 0),
            violation_score=float(summary.get("violation_score") or 0.0),
        )

    def process_frame(self, attempt_id: str, frame_bytes: bytes) -> InferenceResult:
        session = self._require_session(attempt_id)
        started = time.perf_counter()
        with session.lock:
            alerts = session.orchestrator.process_frame(frame_bytes)
            summary = session.orchestrator.get_summary()
        return self._build_result(alerts, summary, started)

    def process_audio(self, attempt_id: str, audio_bytes: bytes, *, sample_rate: int | None = None) -> InferenceResult:
        session = self._require_session(attempt_id)
        started = time.perf_counter()
        with session.lock:
            alerts = session.orchestrator.process_audio(audio_bytes, sample_rate=sample_rate)
            summary = session.orchestrator.get_summary()
        return self._build_result(alerts, summary, started)

    def process_screen(self, attempt_id: str, frame_bytes: bytes) -> InferenceResult:
        session = self._require_session(attempt_id)
        started = time.perf_counter()
        with session.lock:
            screen_alert = _analyze_screen_frame(frame_bytes)
            if screen_alert:
                session.orchestrator.alert_logger.add(screen_alert)
            alerts = session.orchestrator.alert_logger.drain()
            session.orchestrator.alert_count += len(alerts)
            for alert in alerts:
                sev = (alert.get("severity") or "LOW").upper()
                session.orchestrator.violation_score += session.orchestrator.score_weights.get(sev, 1)
                et = alert.get("event_type", "UNKNOWN")
                session.orchestrator.event_counts[et] = session.orchestrator.event_counts.get(et, 0) + 1
            summary = session.orchestrator.get_summary()
        return self._build_result(alerts, summary, started)

    def close_session(self, attempt_id: str) -> None:
        attempt_key = str(attempt_id)
        with self._lock:
            session = self._sessions.pop(attempt_key, None)
        if session is not None:
            self._close_session(session)

    def close_all(self) -> None:
        with self._lock:
            sessions = list(self._sessions.values())
            self._sessions.clear()
        for session in sessions:
            self._close_session(session)

    def _require_session(self, attempt_id: str) -> InferenceSession:
        attempt_key = str(attempt_id)
        with self._lock:
            session = self._sessions.get(attempt_key)
        if session is None:
            raise KeyError(f"Proctoring inference session not found for attempt {attempt_key}")
        return session

    @staticmethod
    def _close_session(session: InferenceSession) -> None:
        with contextlib.suppress(Exception):
            session.orchestrator.close()

    @staticmethod
    def _build_result(alerts: list[dict[str, Any]], summary: dict[str, Any], started: float) -> InferenceResult:
        latency_ms = (time.perf_counter() - started) * 1000
        return InferenceResult(
            alerts=alerts,
            summary=summary,
            face_checks=int(summary.get("face_checks") or 0),
            violation_score=float(summary.get("violation_score") or 0.0),
            latency_ms=latency_ms,
        )

    @staticmethod
    def _build_detection_status(orchestrator: Any, exam_cfg: Mapping[str, Any]) -> dict[str, bool]:
        def enabled(key: str, default: bool = False) -> bool:
            return bool(exam_cfg.get(key, default))

        try:
            face_model_ok = _get_face_model() is not None
        except Exception:
            face_model_ok = False

        try:
            object_model_ok = orchestrator.object_detector._get_model() is not None
        except Exception:
            object_model_ok = False

        return {
            "face_detection": enabled("face_detection", True) and face_model_ok,
            "multi_face": enabled("multi_face", True) and face_model_ok,
            "object_detection": enabled("object_detection", True) and object_model_ok,
            "eye_tracking": enabled("eye_tracking", True),
            "head_pose_detection": enabled("head_pose_detection", True),
            "audio_detection": enabled("audio_detection", True),
            "mouth_detection": enabled("mouth_detection", False),
        }


class ProctoringInferenceGateway:
    async def open_session(
        self,
        attempt_id: str,
        exam_cfg: Mapping[str, Any] | None = None,
        *,
        initial_violation_score: float = 0.0,
    ) -> SessionOpenResponse:
        raise NotImplementedError

    async def process_frame(self, attempt_id: str, frame_bytes: bytes) -> InferenceResult:
        raise NotImplementedError

    async def process_audio(self, attempt_id: str, audio_bytes: bytes, *, sample_rate: int | None = None) -> InferenceResult:
        raise NotImplementedError

    async def process_screen(self, attempt_id: str, frame_bytes: bytes) -> InferenceResult:
        raise NotImplementedError

    async def close_session(self, attempt_id: str) -> None:
        raise NotImplementedError


class LocalProctoringInferenceGateway(ProctoringInferenceGateway):
    def __init__(self, store: ProctoringInferenceStore) -> None:
        self._store = store

    async def open_session(
        self,
        attempt_id: str,
        exam_cfg: Mapping[str, Any] | None = None,
        *,
        initial_violation_score: float = 0.0,
    ) -> SessionOpenResponse:
        return await asyncio.to_thread(
            self._store.open_session,
            attempt_id,
            exam_cfg,
            initial_violation_score=initial_violation_score,
        )

    async def process_frame(self, attempt_id: str, frame_bytes: bytes) -> InferenceResult:
        return await asyncio.to_thread(self._store.process_frame, attempt_id, frame_bytes)

    async def process_audio(self, attempt_id: str, audio_bytes: bytes, *, sample_rate: int | None = None) -> InferenceResult:
        return await asyncio.to_thread(self._store.process_audio, attempt_id, audio_bytes, sample_rate=sample_rate)

    async def process_screen(self, attempt_id: str, frame_bytes: bytes) -> InferenceResult:
        return await asyncio.to_thread(self._store.process_screen, attempt_id, frame_bytes)

    async def close_session(self, attempt_id: str) -> None:
        await asyncio.to_thread(self._store.close_session, attempt_id)


class RemoteProctoringInferenceGateway(ProctoringInferenceGateway):
    def __init__(self, base_url: str) -> None:
        self._client = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            timeout=httpx.Timeout(connect=5.0, read=60.0, write=60.0, pool=60.0),
        )

    async def open_session(
        self,
        attempt_id: str,
        exam_cfg: Mapping[str, Any] | None = None,
        *,
        initial_violation_score: float = 0.0,
    ) -> SessionOpenResponse:
        response = await self._client.post(
            "/internal/proctoring/sessions/open",
            json={
                "attempt_id": str(attempt_id),
                "exam_cfg": dict(exam_cfg or {}),
                "initial_violation_score": float(initial_violation_score or 0.0),
            },
        )
        response.raise_for_status()
        return SessionOpenResponse.model_validate(response.json())

    async def process_frame(self, attempt_id: str, frame_bytes: bytes) -> InferenceResult:
        response = await self._client.post(
            f"/internal/proctoring/sessions/{attempt_id}/frame",
            content=frame_bytes,
            headers={"content-type": "application/octet-stream"},
        )
        response.raise_for_status()
        return InferenceResult.model_validate(response.json())

    async def process_audio(self, attempt_id: str, audio_bytes: bytes, *, sample_rate: int | None = None) -> InferenceResult:
        params: dict[str, Any] = {}
        if sample_rate is not None:
            params["sample_rate"] = int(sample_rate)
        response = await self._client.post(
            f"/internal/proctoring/sessions/{attempt_id}/audio",
            params=params,
            content=audio_bytes,
            headers={"content-type": "application/octet-stream"},
        )
        response.raise_for_status()
        return InferenceResult.model_validate(response.json())

    async def process_screen(self, attempt_id: str, frame_bytes: bytes) -> InferenceResult:
        response = await self._client.post(
            f"/internal/proctoring/sessions/{attempt_id}/screen",
            content=frame_bytes,
            headers={"content-type": "application/octet-stream"},
        )
        response.raise_for_status()
        return InferenceResult.model_validate(response.json())

    async def close_session(self, attempt_id: str) -> None:
        response = await self._client.delete(f"/internal/proctoring/sessions/{attempt_id}")
        if response.status_code not in {200, 204, 404}:
            response.raise_for_status()


class CeleryProctoringInferenceGateway(ProctoringInferenceGateway):
    def __init__(
        self,
        *,
        queue_name: str,
        task_timeout_seconds: int,
        open_session_timeout_seconds: int | None = None,
    ) -> None:
        self._queue_name = str(queue_name).strip() or "proctoring-inference"
        self._task_timeout_seconds = max(int(task_timeout_seconds or 30), 5)
        self._open_session_timeout_seconds = max(
            int(open_session_timeout_seconds or self._task_timeout_seconds),
            self._task_timeout_seconds,
        )

    @staticmethod
    def _encode_payload(payload: bytes) -> str:
        return base64.b64encode(payload).decode("ascii")

    async def _wait_for_result(self, task_name: str, *, timeout_seconds: int | None = None, **kwargs: Any) -> dict[str, Any]:
        from ..core.celery_app import celery_app

        async_result = celery_app.send_task(
            task_name,
            kwargs=kwargs,
            queue=self._queue_name,
        )
        timeout = max(int(timeout_seconds or self._task_timeout_seconds), 5)
        try:
            payload = await asyncio.to_thread(
                async_result.get,
                timeout=timeout,
                propagate=True,
                interval=0.2,
            )
        except CeleryTimeoutError as exc:
            raise TimeoutError(f"Timed out waiting for Celery task {task_name}") from exc
        if not isinstance(payload, Mapping):
            raise RuntimeError(f"Celery task {task_name} returned an invalid payload")
        return dict(payload)

    async def open_session(
        self,
        attempt_id: str,
        exam_cfg: Mapping[str, Any] | None = None,
        *,
        initial_violation_score: float = 0.0,
    ) -> SessionOpenResponse:
        payload = await self._wait_for_result(
            "proctoring.open_session",
            timeout_seconds=self._open_session_timeout_seconds,
            attempt_id=str(attempt_id),
            exam_cfg=dict(exam_cfg or {}),
            initial_violation_score=float(initial_violation_score or 0.0),
        )
        return SessionOpenResponse.model_validate(payload)

    async def process_frame(self, attempt_id: str, frame_bytes: bytes) -> InferenceResult:
        payload = await self._wait_for_result(
            "proctoring.process_frame",
            attempt_id=str(attempt_id),
            frame_b64=self._encode_payload(frame_bytes),
        )
        return InferenceResult.model_validate(payload)

    async def process_audio(self, attempt_id: str, audio_bytes: bytes, *, sample_rate: int | None = None) -> InferenceResult:
        payload = await self._wait_for_result(
            "proctoring.process_audio",
            attempt_id=str(attempt_id),
            audio_b64=self._encode_payload(audio_bytes),
            sample_rate=int(sample_rate) if sample_rate is not None else None,
        )
        return InferenceResult.model_validate(payload)

    async def process_screen(self, attempt_id: str, frame_bytes: bytes) -> InferenceResult:
        payload = await self._wait_for_result(
            "proctoring.process_screen",
            attempt_id=str(attempt_id),
            frame_b64=self._encode_payload(frame_bytes),
        )
        return InferenceResult.model_validate(payload)

    async def close_session(self, attempt_id: str) -> None:
        from ..core.celery_app import celery_app

        async_result = celery_app.send_task(
            "proctoring.close_session",
            kwargs={"attempt_id": str(attempt_id)},
            queue=self._queue_name,
        )
        with contextlib.suppress(Exception):
            await asyncio.to_thread(
                async_result.get,
                timeout=max(5, min(self._task_timeout_seconds, 10)),
                propagate=True,
                interval=0.2,
            )


class SessionOpenRequest(BaseModel):
    attempt_id: str
    exam_cfg: dict[str, Any] = Field(default_factory=dict)
    initial_violation_score: float = 0.0


@lru_cache
def get_proctoring_inference_store() -> ProctoringInferenceStore:
    return ProctoringInferenceStore()


@lru_cache
def get_proctoring_inference_gateway() -> ProctoringInferenceGateway:
    settings = get_settings()
    if settings.PROCTORING_INFERENCE_MODE == "remote":
        logger.info("Using remote proctoring inference gateway at %s", settings.AI_INFERENCE_URL)
        return RemoteProctoringInferenceGateway(settings.AI_INFERENCE_URL)
    if settings.PROCTORING_INFERENCE_MODE == "celery":
        logger.info("Using Celery proctoring inference gateway on queue %s", settings.PROCTORING_INFERENCE_QUEUE)
        return CeleryProctoringInferenceGateway(
            queue_name=settings.PROCTORING_INFERENCE_QUEUE,
            task_timeout_seconds=settings.PROCTORING_INFERENCE_TASK_TIMEOUT_SECONDS,
            open_session_timeout_seconds=settings.PROCTORING_INFERENCE_OPEN_TIMEOUT_SECONDS,
        )
    logger.info("Using local proctoring inference gateway")
    return LocalProctoringInferenceGateway(get_proctoring_inference_store())
