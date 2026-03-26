from __future__ import annotations

import asyncio
import base64
from types import SimpleNamespace

import app.core.celery_app as celery_module
import app.services.proctoring_inference as inference_module
import app.tasks.proctoring_inference as inference_task_module
from app.services.proctoring_inference import CeleryProctoringInferenceGateway, InferenceResult


def test_celery_gateway_process_frame_uses_queue_and_base64(monkeypatch) -> None:
    calls: dict[str, object] = {}

    class FakeAsyncResult:
        def get(self, timeout: int, propagate: bool, interval: float) -> dict[str, object]:
            calls["get"] = {
                "timeout": timeout,
                "propagate": propagate,
                "interval": interval,
            }
            return {
                "alerts": [{"event_type": "MULTI_FACE", "severity": "HIGH", "detail": "Multiple faces detected"}],
                "summary": {"face_checks": 4},
                "face_checks": 4,
                "violation_score": 3.0,
                "latency_ms": 125.0,
            }

    class FakeCeleryApp:
        def send_task(self, task_name: str, kwargs: dict[str, object] | None = None, queue: str | None = None) -> FakeAsyncResult:
            calls["send_task"] = {
                "task_name": task_name,
                "kwargs": dict(kwargs or {}),
                "queue": queue,
            }
            return FakeAsyncResult()

    monkeypatch.setattr(celery_module, "celery_app", FakeCeleryApp())

    gateway = CeleryProctoringInferenceGateway(queue_name="proctoring-inference", task_timeout_seconds=12)
    result = asyncio.run(gateway.process_frame("attempt-123", b"frame-bytes"))

    send_call = calls["send_task"]
    assert isinstance(send_call, dict)
    assert send_call["task_name"] == "proctoring.process_frame"
    assert send_call["queue"] == "proctoring-inference"
    assert base64.b64decode(send_call["kwargs"]["frame_b64"]) == b"frame-bytes"
    assert result.alerts[0]["event_type"] == "MULTI_FACE"
    assert result.face_checks == 4
    assert result.violation_score == 3.0


def test_get_proctoring_inference_gateway_supports_celery_mode(monkeypatch) -> None:
    inference_module.get_proctoring_inference_gateway.cache_clear()
    monkeypatch.setattr(
        inference_module,
        "get_settings",
        lambda: SimpleNamespace(
            PROCTORING_INFERENCE_MODE="celery",
            PROCTORING_INFERENCE_QUEUE="queue-x",
            PROCTORING_INFERENCE_OPEN_TIMEOUT_SECONDS=45,
            PROCTORING_INFERENCE_TASK_TIMEOUT_SECONDS=17,
            AI_INFERENCE_URL="http://unused",
        ),
    )

    gateway = inference_module.get_proctoring_inference_gateway()

    assert isinstance(gateway, CeleryProctoringInferenceGateway)
    assert gateway._queue_name == "queue-x"
    assert gateway._task_timeout_seconds == 17
    assert gateway._open_session_timeout_seconds == 45
    inference_module.get_proctoring_inference_gateway.cache_clear()


def test_process_frame_task_restores_session_from_database_context(monkeypatch) -> None:
    call_count = {"process_frame": 0}
    reopened: dict[str, object] = {}

    class FakeStore:
        def open_session(self, attempt_id: str, exam_cfg: dict[str, object], *, initial_violation_score: float = 0.0):
            reopened["attempt_id"] = attempt_id
            reopened["exam_cfg"] = dict(exam_cfg)
            reopened["initial_violation_score"] = initial_violation_score

        def process_frame(self, attempt_id: str, frame_bytes: bytes) -> InferenceResult:
            call_count["process_frame"] += 1
            if call_count["process_frame"] == 1:
                raise KeyError(f"session missing for {attempt_id}")
            return InferenceResult(
                alerts=[{"event_type": "FACE_MISSING", "severity": "LOW"}],
                summary={"face_checks": 1},
                face_checks=1,
                violation_score=1.0,
                latency_ms=10.0,
            )

    monkeypatch.setattr(inference_task_module, "store", FakeStore())
    monkeypatch.setattr(inference_task_module, "_ensure_worker_models_ready", lambda: None)
    monkeypatch.setattr(
        inference_task_module,
        "_load_attempt_runtime_context",
        lambda attempt_id: ({"face_detection": True}, 6.0),
    )

    payload = base64.b64encode(b"frame-1").decode("ascii")
    result = inference_task_module.process_proctoring_frame_task.run("attempt-42", payload)

    assert call_count["process_frame"] == 2
    assert reopened == {
        "attempt_id": "attempt-42",
        "exam_cfg": {"face_detection": True},
        "initial_violation_score": 6.0,
    }
    assert result["alerts"][0]["event_type"] == "FACE_MISSING"
