# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SYRA LMS — a full-stack Learning Management System with AI-powered exam proctoring. FastAPI backend, React frontend, PostgreSQL database, Redis for real-time features and Celery task queue.

## Build & Development Commands

### Frontend (from `frontend/`)
```bash
npm run dev          # Vite dev server on port 5173
npm run build        # Production build
npm run lint         # ESLint
npm run format       # Prettier
npm run test         # Vitest unit tests (jsdom)
npm run test:e2e     # Playwright E2E (starts backend + frontend automatically)
```

### Backend (from `backend/`)
```bash
# Activate venv first
source .venv/Scripts/activate   # Windows Git Bash
source .venv/bin/activate       # Linux/Mac

# Run server
uvicorn src.app.main:app --reload --port 8000

# Run tests
PYTHONPATH=src pytest tests/ -v                          # All tests
PYTHONPATH=src pytest tests/test_pagination.py -v        # Single file
PYTHONPATH=src pytest tests/test_pagination.py::test_normalize_pagination_accepts_combined_sort_and_order -v  # Single test

# Migrations
alembic upgrade head            # Apply all migrations
alembic revision --autogenerate -m "description"  # Create migration
```

### Docker (from project root)
```bash
docker compose up -d --build    # Full stack: backend, frontend (nginx), redis, celery workers
```

### Playwright E2E against live site
```bash
cd frontend
PLAYWRIGHT_BASE_URL=https://testme.zedny.ai npx playwright test --config=playwright.live-audit.config.js
```

## Architecture

### Backend (`backend/src/app/`)

**Domain-driven modules** — each module has `models.py`, `schemas.py`, `service.py`, `repository.py`, `enums.py`, `routes_public.py`, `routes_admin.py`:
- `modules/auth/` — JWT login, signup, password reset, token refresh
- `modules/attempts/` — exam taking, scoring, auto-grading, certificate review
- `modules/tests/` — exam CRUD, publishing lifecycle (DRAFT → OPEN → ARCHIVED)
- `modules/users/` — user CRUD, roles (ADMIN, INSTRUCTOR, LEARNER)
- `modules/proctoring/` — WebSocket proctoring session, video uploads, live monitoring
- `modules/reports/` — predefined/custom reports, scheduled report generation

**AI detection system** (`detection/`):
- `orchestrator.py` — coordinates all detectors, manages shared FaceMesh instance
- Individual detectors: `face_detection.py`, `eye_tracking.py`, `head_pose.py`, `audio_detection.py`, `screen_analysis.py`, `object_detection.py`, `liveness.py`, `face_verification.py`
- Shared module-level `_SHARED_FACE_MESH` with `static_image_mode=True` for thread safety

**Key services** (`services/`):
- `proctoring_inference.py` — `ProctoringInferenceStore` manages per-session detection state; `LocalProctoringInferenceGateway` bridges async WebSocket to sync detection
- `live_bus.py` — Redis pub/sub for live monitoring dashboard
- `crypto_utils.py` — Fernet encryption for identity photos/evidence (requires `EVIDENCE_KEY` env var)
- `notifications.py` — in-app notifications (uses savepoints, not independent commits)

**Background tasks** (`tasks/`):
- Celery workers for proctoring video upload/processing and batch AI analysis
- Uses `_run_async()` helper for async calls in Celery (handles existing event loops)

### Frontend (`frontend/src/`)

**State management**: React Context (`AuthContext` for auth/tokens, `ThemeContext`), custom hooks, no Redux.

**Auth flow** (`context/AuthContext.jsx`):
- JWT tokens stored in localStorage with proactive refresh
- Uses `tokensRef` (not state) inside effects to prevent infinite refresh loops
- `permissionsLoading`/`permissionsError` included in useMemo deps for permission gating

**API layer** (`services/api.js`):
- Axios instance with request deduplication for GET requests (uses settled promises)
- Navigation-scoped request cancellation via AbortController
- Auto token refresh on 401 with coalesced refresh requests

**Routing** (`routes/AppRoutes.jsx`):
- `RequireAccess` wrapper for permission-gated routes
- Lazy-loaded page components
- Maintenance mode detection with polling

**Proctoring UI** (`components/ProctorOverlay/`):
- WebSocket connection to `/api/proctoring/ws`
- Callback props stored in refs to minimize WebSocket reconnections (dependency array kept to connection-essential values only)
- Screen capture, audio capture, frame analysis loops

### Database

- PostgreSQL via SQLAlchemy 2.0 async with psycopg driver
- Alembic migrations auto-applied on startup (`AUTO_APPLY_MIGRATIONS=true`)
- Special Supabase pooler handling (NullPool option, shorter recycle, pgbouncer compatibility)
- 60+ tables across all modules

## Key Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | JWT signing key (min 32 chars) |
| `REDIS_URL` | For Celery/live | Redis connection |
| `EVIDENCE_KEY` | For encryption | Fernet key for identity photos |
| `BREVO_API_KEY` | For email | Brevo email delivery |
| `OPENAI_API_KEY` | For AI features | OpenAI integration |
| `CLOUDFLARE_MEDIA_API_BASE_URL` | For video | Proctoring video storage |

## Important Patterns

- **Authorization**: Route-level `require_permission()` + service-level `ensure_exam_owner()`. Each admin/instructor sees only their own exams and data — no global access, even for ADMIN role.
- **Proctoring WebSocket**: Single long-lived DB session for the entire WS lifetime (released only in outermost finally block). Audio processing offloaded to thread pool via `asyncio.to_thread()`.
- **Question types**: MCQ, MULTI, TRUEFALSE, TEXT, ORDERING, FILLINBLANK, MATCHING — must be consistent across QuestionPoolDetail, AdminNewTestWizard, and AdminManageTestPage.
- **Negative marking**: Skipped when `is_correct is None` (no configured answer). Percentage deductions capped at question point value.
- **Report scoping**: Predefined reports filter by `actor_id` for non-admin users. Custom reports expose dataset-level access.

## Live Environment

- **URL**: https://testme.zedny.ai
- **API**: https://testme.zedny.ai/api/
- **Default admin**: admin@testme.com
