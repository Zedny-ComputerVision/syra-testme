from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse

from ..core.logging import setup_logging
from ..services.proctoring_inference import (
    InferenceResult,
    SessionOpenRequest,
    SessionOpenResponse,
    get_proctoring_inference_store,
    warm_inference_models,
)

setup_logging()
logger = logging.getLogger("syra.ai_inference")
store = get_proctoring_inference_store()


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.ready = False
    app.state.model_status = {}
    logger.info("Starting AI inference service")
    app.state.model_status = await asyncio.to_thread(warm_inference_models)
    app.state.ready = True
    try:
        yield
    finally:
        app.state.ready = False
        await asyncio.to_thread(store.close_all)


app = FastAPI(title="SYRA AI Inference", redirect_slashes=False, lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready")
def ready() -> JSONResponse:
    if not getattr(app.state, "ready", False):
        return JSONResponse(status_code=503, content={"status": "warming"})
    return JSONResponse(
        status_code=200,
        content={"status": "ready", "models": getattr(app.state, "model_status", {})},
    )


@app.post("/internal/proctoring/sessions/open", response_model=SessionOpenResponse)
async def open_session(payload: SessionOpenRequest) -> SessionOpenResponse:
    return await asyncio.to_thread(
        store.open_session,
        payload.attempt_id,
        payload.exam_cfg,
        initial_violation_score=payload.initial_violation_score,
    )


@app.post("/internal/proctoring/sessions/{attempt_id}/frame", response_model=InferenceResult)
async def process_frame(attempt_id: str, request: Request) -> InferenceResult:
    frame_bytes = await request.body()
    if not frame_bytes:
        raise HTTPException(status_code=400, detail="frame payload is required")
    try:
        return await asyncio.to_thread(store.process_frame, attempt_id, frame_bytes)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/internal/proctoring/sessions/{attempt_id}/audio", response_model=InferenceResult)
async def process_audio(attempt_id: str, request: Request, sample_rate: int | None = None) -> InferenceResult:
    audio_bytes = await request.body()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="audio payload is required")
    try:
        return await asyncio.to_thread(store.process_audio, attempt_id, audio_bytes, sample_rate=sample_rate)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/internal/proctoring/sessions/{attempt_id}/screen", response_model=InferenceResult)
async def process_screen(attempt_id: str, request: Request) -> InferenceResult:
    frame_bytes = await request.body()
    if not frame_bytes:
        raise HTTPException(status_code=400, detail="screen payload is required")
    try:
        return await asyncio.to_thread(store.process_screen, attempt_id, frame_bytes)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.delete("/internal/proctoring/sessions/{attempt_id}", status_code=204)
async def close_session(attempt_id: str) -> Response:
    await asyncio.to_thread(store.close_session, attempt_id)
    return Response(status_code=204)
