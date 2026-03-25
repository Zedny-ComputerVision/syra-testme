from __future__ import annotations

import asyncio
import contextlib
import logging
import threading
import time
from collections.abc import Mapping
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any

import httpx
from pydantic import BaseModel, Field

from ..core.config import get_settings
from ..detection._yolo_face import get_face_model
from ..detection.orchestrator import ProctoringOrchestrator, prewarm_shared_mesh
from ..detection.screen_analysis import analyze_screen_bytes

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
    orchestrator: ProctoringOrchestrator
    lock: threading.Lock = field(default_factory=threading.Lock)


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
        model = get_face_model()
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
        prewarm_shared_mesh()
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
        orchestrator = ProctoringOrchestrator(config)
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
        alerts: list[dict[str, Any]] = []
        with session.lock:
            screen_alert = analyze_screen_bytes(frame_bytes)
            if screen_alert:
                alerts.append(screen_alert)
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
    def _build_detection_status(orchestrator: ProctoringOrchestrator, exam_cfg: Mapping[str, Any]) -> dict[str, bool]:
        enabled = lambda key, default=False: bool(exam_cfg.get(key, default))

        try:
            face_model_ok = get_face_model() is not None
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
    logger.info("Using local proctoring inference gateway")
    return LocalProctoringInferenceGateway(get_proctoring_inference_store())
