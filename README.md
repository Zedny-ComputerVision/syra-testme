# SYRA LMS

Full-stack LMS with a FastAPI backend and React frontend.

## Setup Guides

- Windows: [docs/setup-windows.md](/e:/codexxx/docs/setup-windows.md)
- Linux: [docs/setup-linux.md](/e:/codexxx/docs/setup-linux.md)

## Quick Start

1. Copy `.env.example` to `.env`.
2. Copy `frontend/.env.example` to `frontend/.env`.
3. Set `DATABASE_URL` and `JWT_SECRET` in `.env`.
4. Follow the platform-specific guide above.

Default local URLs:

- Frontend: `http://127.0.0.1:5173`
- Backend API: `http://127.0.0.1:8000/api`
- Backend DB health check: `http://127.0.0.1:8000/api/health/db`

## Linux One-Command Local Stack

```bash
bash scripts/setup-linux.sh
```

That script prepares `backend/.env.docker` and `frontend/.env.production`, starts a local PostgreSQL container, builds the images, and brings up the full stack at `http://localhost`.

## Docker Deployment

### 1. Configure environment

```bash
cp backend/.env.docker.example backend/.env.docker
cp frontend/.env.production.example frontend/.env.production
# Edit backend/.env.docker — at minimum set:
#   DATABASE_URL, JWT_SECRET, FRONTEND_BASE_URL, BACKEND_BASE_URL, CORS_ORIGINS
```

**Required** `backend/.env.docker` values for Docker:

| Variable | Example |
|---|---|
| `DATABASE_URL` | `postgresql+psycopg://user:pass@host:5432/syra_lms` |
| `JWT_SECRET` | Generate: `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `FRONTEND_BASE_URL` | `https://your-domain.com` |
| `BACKEND_BASE_URL` | `https://your-domain.com/api` |
| `CORS_ORIGINS` | `https://your-domain.com` |

**Optional** backend tuning:

| Variable | Default | Notes |
|---|---|---|
| `MAX_VIDEO_UPLOAD_MB` | `512` | Max proctoring video upload size |
| `MEDIA_STORAGE_PROVIDER` | `local` | `local` or `supabase` |
| `PROCTORING_VIDEO_STORAGE_PROVIDER` | `local` | `local`, `cloudflare`, or `supabase` |

### 2. Build and start

```bash
# Create storage directory (bind-mounted volume)
mkdir -p backend/storage

# Build and launch
docker compose up --build -d

# Verify health
docker compose ps
curl http://localhost/api/health/db
```

### 3. Architecture

```
Internet → :80 nginx (frontend) → /api/* proxy → :8000 gunicorn (backend) → PostgreSQL
                                 → /*  SPA files
```

- **Frontend**: nginx serves the React SPA and reverse-proxies `/api/` to the backend
- **Backend**: gunicorn with uvicorn workers, auto-applies Alembic migrations on startup
- **Storage**: `backend/storage/` is bind-mounted for videos, evidence, reports, identity files
- Backend port is **not** exposed externally — all traffic goes through nginx

### 4. Local PostgreSQL Shortcut

For a local Linux Docker stack that also starts PostgreSQL, use:

```bash
bash scripts/setup-linux.sh
```

## Notes

- AI proctoring uses YOLO + MediaPipe + DeepFace for face/object detection. Models are pre-warmed at startup.
- Proctoring videos default to local storage. Set `PROCTORING_VIDEO_STORAGE_PROVIDER=cloudflare` and `CLOUDFLARE_MEDIA_API_BASE_URL` for Cloudflare Stream.
- Data retention cleanup runs every 24h (configurable via `*_RETENTION_DAYS` env vars).
- Reports are written to `backend/storage/reports/`, evidence to `backend/storage/evidence/`.

## Full Test Run

Windows full-suite script:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-full-tests.ps1
```

Skip Playwright E2E on Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-full-tests.ps1 -SkipFrontendE2E
```

Equivalent manual commands on Linux or macOS:

```bash
cd backend
source .venv/bin/activate
PYTHONPATH="$PWD:$PWD/src" \
SECRET_KEY="test-secret-key-with-at-least-32-chars" \
DATABASE_URL="${DATABASE_URL:-postgresql+psycopg://postgres:password@localhost:5432/syra_lms}" \
AUTO_APPLY_MIGRATIONS=false \
PRECHECK_ALLOW_TEST_BYPASS=true \
python -m pytest -q ../_workspace_nonruntime/tests/backend/tests

cd ../frontend
npm run test -- --run
npm run test:e2e
```

Requirements for the backend test run:

- Postgres available at `DATABASE_URL` or the local default `postgresql+psycopg://postgres:password@localhost:5432/syra_lms`
- Frontend E2E depends on Playwright dependencies already installed
