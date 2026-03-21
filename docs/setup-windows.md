# Windows Setup Guide

## Prerequisites

- Windows 10 or Windows 11
- Python 3.11
- Node.js 20.x and npm
- Git
- PostgreSQL or a hosted PostgreSQL database such as Supabase
- Optional: Docker Desktop if you want the containerized deployment flow

Recommended tools:

- PowerShell 7
- Visual Studio Build Tools only if a native Python dependency fails to install

## 1. Clone and configure the project

From PowerShell:

```powershell
git clone <your-repo-url>
cd <repo-dir>
Copy-Item .env.example .env
Copy-Item frontend\.env.example frontend\.env
```

Update `.env` before starting the backend:

- Set `DATABASE_URL` to your PostgreSQL or Supabase connection string
- Set `JWT_SECRET` to a real secret with at least 32 characters
- Leave `AUTO_APPLY_MIGRATIONS=false` if you want to run Alembic manually
- Set `CLOUDFLARE_MEDIA_API_BASE_URL` to your Cloudflare Stream endpoint (required for proctoring video storage)

For local frontend development, `frontend\.env` can stay at:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000/api
```

## 2. Set up the backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

If `Activate.ps1` is blocked, run PowerShell as your user and allow local scripts:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

If `mediapipe`, `opencv-python`, or other heavier packages fail during install, confirm you are on Python 3.11 and retry inside a clean virtual environment.

## 3. Run database migrations

With the backend virtual environment still active:

```powershell
alembic upgrade head
```

If you prefer automatic migrations on backend startup, set this in `.env`:

```env
AUTO_APPLY_MIGRATIONS=true
```

## 4. Start the backend

```powershell
uvicorn src.app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend URLs:

- API root: `http://127.0.0.1:8000/api`
- Health check: `http://127.0.0.1:8000/api/health/db`

## 5. Set up the frontend

Open a second PowerShell window:

```powershell
cd frontend
npm install
npm run dev
```

Frontend URL:

- App: `http://127.0.0.1:5173`

## 6. Seed demo data

From the backend directory with the virtual environment active:

```powershell
python scripts\seed_demo_data.py
```

## 7. Run tests

Full Windows test run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-full-tests.ps1
```

Skip Playwright E2E:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-full-tests.ps1 -SkipFrontendE2E
```

Run pieces manually:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
$env:PYTHONPATH = "$PWD;$PWD\src"
$env:SECRET_KEY = "test-secret-key-with-at-least-32-chars"
$env:DATABASE_URL = if ($env:DATABASE_URL) { $env:DATABASE_URL } else { "postgresql+psycopg://postgres:password@localhost:5432/syra_lms" }
$env:AUTO_APPLY_MIGRATIONS = "false"
$env:PRECHECK_ALLOW_TEST_BYPASS = "true"
python -m pytest -q ..\_workspace_nonruntime\tests\backend\tests
```

```powershell
cd frontend
npm run test -- --run
npm run test:e2e
```

Note: CI runs the same mirrored backend suite path shown above and uses PostgreSQL, not SQLite.

If Playwright browsers are missing:

```powershell
cd frontend
npx playwright install
```

## 8. Docker Compose deployment flow

This project's `docker-compose.yml` expects an external PostgreSQL database such as Supabase.

1. Create the Docker env files:
   - `Copy-Item backend\.env.docker.example backend\.env.docker`
   - `Copy-Item frontend\.env.production.example frontend\.env.production`
2. Set these in `backend\.env.docker`:
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `FRONTEND_BASE_URL`
   - `BACKEND_BASE_URL`
   - `CLOUDFLARE_MEDIA_API_BASE_URL`
3. Start the stack:

```powershell
docker compose up --build -d
```

## Troubleshooting

- `JWT_SECRET` validation error: use a secret with at least 32 characters.
- Database connection failures: verify `DATABASE_URL`, SSL requirements, and network access to your Postgres host.
- Backend starts but frontend cannot log in: confirm `frontend\.env` points to `http://127.0.0.1:8000/api`.
- Proctoring uploads fail: verify `CLOUDFLARE_MEDIA_API_BASE_URL` is correctly configured.
- Local file artifacts are written under `backend\storage`.
