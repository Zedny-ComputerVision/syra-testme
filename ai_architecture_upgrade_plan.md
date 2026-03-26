# Architecture Upgrade Plan: Asynchronous AI Proctoring

## Implementation Status
Status updated on March 27, 2026.

- [x] Step 1 complete: Redis and a dedicated Celery inference worker are part of the Docker stack, with queue settings exposed through env vars.
- [x] Step 2 complete: Celery is initialized in `backend/src/app/core/celery_app.py`.
- [x] Step 3 complete: the main FastAPI app no longer owns AI model warmup; the Celery inference worker now warms models on worker boot. The legacy `ai_inference` service remains available only as an optional fallback for `PROCTORING_INFERENCE_MODE=remote`.
- [x] Step 4 complete: live frame, audio, and screen inference now support a Celery-backed execution path through dedicated worker tasks and a `celery` inference gateway mode.
- [x] Step 5 complete: proctoring video upload/register endpoints can persist the upload, enqueue background analysis, and return HTTP `202 Accepted` with `job_id`.
- [x] Step 6 complete: polling endpoint exists for queued proctoring analysis jobs.
- [x] Step 7 complete: the frontend already handles async upload responses and polls job status, while the live proctoring WebSocket continues to emit alerts after worker-side inference completes.

## Verified Implementation

### Backend Runtime
- `backend/src/app/services/proctoring_inference.py` now supports `PROCTORING_INFERENCE_MODE=celery` in addition to `local` and `remote`.
- `backend/src/app/tasks/proctoring_inference.py` owns Celery tasks for:
  - opening inference sessions
  - processing frame chunks
  - processing audio chunks
  - processing screen chunks
  - closing inference sessions
- The Celery worker warms YOLO and MediaPipe models on worker process startup, keeping heavy model initialization outside the FastAPI web process.

### Async Video Analysis
- `backend/src/app/modules/proctoring/routes_public.py` already returns `202` plus `job_id` and `analysis_status_url` when uploaded proctoring videos are queued for background analysis.
- `backend/src/app/services/proctoring_video_batch.py` provides queueing and job status lookup.

### Frontend
- `frontend/src/services/proctoring.service.js` exposes the job-status polling call.
- `frontend/src/pages/Proctoring/Proctoring.jsx` already handles `job_id` responses for uploaded recordings and polls the analysis status endpoint until completion or timeout.

## Current Problem
The SYRA LMS tightly couples the FastAPI web server with heavy AI machine learning models (YOLO Face, YOLO Object, and MediaPipe). Every time the web server restarts or scales horizontally, it forces the AI models to load directly into the synchronous web worker processes.

**This creates two critical bottlenecks in production:**
1. **Startup Starvation (100% CPU spikes):** The API takes over 2-3 minutes to become responsive after a deployment because the workers are busy allocating models into RAM. Incoming web requests (e.g., logins) timeout after 5000ms.
2. **Inference Blocking:** Processing a student's webcam data chunk during an active exam completely blocks the Python worker handling that request. If all workers are performing inference, the entire LMS goes offline for other users until processing finishes.

## Proposed Solution
Decouple the heavy AI processing into a dedicated background worker queue using **Redis** and **Celery**. 

The FastAPI server will instantly accept video chunks and push a JSON job to a Redis queue. A separate "AI Worker" container will independently pick up the jobs, run the YOLO/MediaPipe models, and update the database. This leaves the web server 100% free to serve thousands of concurrent students instantly.

---

## Technical Implementation Steps

### 1. Update Infrastructure Stack
The `docker-compose.yml` needs two new services:
1. **`redis`**: A standard Alpine Redis cache container to hold the message queue.
2. **`ai-worker`**: Uses the exact same Docker image as the backend, but overrides the startup command to launch a Celery background worker instead of Gunicorn.

**Environment Variables Required:**
```ini
REDIS_URL=redis://redis:6379/0
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/0
```

### 2. Introduce Celery to the Backend
Create `backend/src/app/core/celery_app.py` to initialize the task broker:
```python
from celery import Celery
from .config import settings

celery_app = Celery(
    "syra_ai_tasks",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND
)
```

### 3. Cleanup FastAPI Startup Sequence
Modify `backend/src/app/main.py`. Find the section where AI models are automatically loaded on boot (`_pre_warm_models_thread` or similar app lifespan events) and **remove it entirely**. 

FastAPI must boot in < 1 second. The heavy YOLO models should now only be instantiated when the Celery worker process boots, ensuring they live safely inside the worker's RAM boundary.

### 4. Convert AI Inference to Celery Tasks
In `backend/src/app/detection/orchestrator.py`, wrap the synchronous inference logic inside `@celery_app.task` decorators.

```python
@celery_app.task(name="process_proctoring_chunk")
def process_video_chunk_async(attempt_id: str, video_path: str):
    # Initialize YOLO/MediaPipe here if not already loaded globally in the worker
    # Run the existing heavy inference logic
    # Update the database securely
```

### 5. Refactor the Proctoring API Endpoint
Modify `backend/src/app/modules/core/proctoring/routes.py` (specifically the video chunk upload endpoint).

**Current Flow (Bad):**
1. Receive video
2. Wait for AI inference (30-60 secs)
3. Return findings 

**New Async Flow (Good):**
1. Receive video
2. Save file to Cloudflare/Supabase or local storage.
3. Push to queue: `process_video_chunk_async.delay(attempt_id, file_path)`
4. Immediately return HTTP `202 Accepted` with a `job_id`.

### 6. Create a Polling Endpoint
Create a simple, lightning-fast endpoint so the React frontend can check if the background worker has finished processing the AI inference.
```http
GET /api/proctoring/jobs/{job_id}/status
{
    "status": "COMPLETED",
    "findings": [...]
}
```

### 7. Refactor the Frontend UI
The student/instructor dashboard UI must be updated to expect the initial HTTP `202 Accepted` response. It should then either:
* Poll the new status endpoint every 5 seconds.
* (Optional but recommended) Connect via WebSockets so the backend can emit an event the exact millisecond the Celery worker completes the job.

---

## Infrastructure Requirements
Running this split architecture will require slightly more memory than the current monolithic setup because the API and the Worker are completely isolated processes.
* **Suggested VM Minimum:** 4 vCPUs / 8GB RAM.
