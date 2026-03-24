# Linux Setup Guide

## Prerequisites

- A recent Debian, Ubuntu, Fedora, or similar Linux distribution
- Python 3.11
- Node.js 20.x and npm
- Git
- PostgreSQL or a hosted PostgreSQL database such as Supabase
- Optional: Docker Engine and Docker Compose plugin for the containerized deployment flow

System packages commonly needed for the backend runtime:

- `tesseract-ocr`
- `libgl1`
- `libglib2.0-0`
- `libgomp1`

On Debian or Ubuntu:

```bash
sudo apt update
sudo apt install -y python3.11 python3.11-venv python3-pip nodejs npm git tesseract-ocr libgl1 libglib2.0-0 libgomp1
```

If your distro packages an older Node version, install Node 20 separately with `nvm` or NodeSource.

## Fastest Path

If Docker Engine and the Docker Compose plugin are already installed, the quickest way to run the whole project on Linux is:

```bash
bash scripts/setup-linux.sh
```

That one command prepares Docker env files, starts a local PostgreSQL container, builds the images, seeds a large demo dataset, and brings up the full stack at `http://localhost`.
Proctoring recordings are stored on Cloudflare Stream. Set `SYRA_CLOUDFLARE_MEDIA_API_BASE_URL` to your Cloudflare Stream endpoint.

Default seeded credentials:

- `admin@example.com` / `Admin1234!`
- `instructor@example.com` / `Instructor1234!`
- `student1@example.com` / `Student1234!`
- `student2@example.com` / `Student1234!`

## 1. Clone and configure the project

```bash
git clone <your-repo-url>
cd <repo-dir>
cp .env.example .env
cp frontend/.env.example frontend/.env
```

Update `.env` before starting the backend:

- Set `DATABASE_URL` to your PostgreSQL or Supabase connection string
- If you use the Supabase session pooler for runtime traffic, set `DATABASE_MIGRATION_URL` to the direct Supabase Postgres connection string for Alembic migrations
- Set `JWT_SECRET` to a real secret with at least 32 characters
- Leave `AUTO_APPLY_MIGRATIONS=false` if you want to run Alembic manually
- Set `CLOUDFLARE_MEDIA_API_BASE_URL` to your Cloudflare Stream endpoint (required for proctoring video storage)

For local frontend development, `frontend/.env` can stay at:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000/api
```

## 2. Set up the backend

```bash
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

If `mediapipe` or `opencv-python` installation fails, confirm you are using Python 3.11 and the required system libraries are installed.

## 3. Run database migrations

With the backend virtual environment still active:

```bash
alembic upgrade head
```

If you prefer automatic migrations on backend startup, set this in `.env`:

```env
AUTO_APPLY_MIGRATIONS=true
```

## 4. Start the backend

```bash
uvicorn src.app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend URLs:

- API root: `http://127.0.0.1:8000/api`
- Health check: `http://127.0.0.1:8000/api/health/db`

## 5. Set up the frontend

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend URL:

- App: `http://127.0.0.1:5173`

## 6. Seed demo data

From the backend directory with the virtual environment active:

```bash
python scripts/seed_demo_data.py
```

## 7. Run tests

Backend tests:

```bash
cd backend
source .venv/bin/activate
PYTHONPATH="$PWD:$PWD/src" \
SECRET_KEY="test-secret-key-with-at-least-32-chars" \
DATABASE_URL="${DATABASE_URL:-postgresql+psycopg://postgres:password@localhost:5432/syra_lms}" \
AUTO_APPLY_MIGRATIONS=false \
PRECHECK_ALLOW_TEST_BYPASS=true \
python -m pytest -q ../_workspace_nonruntime/tests/backend/tests
```

Frontend tests:

```bash
cd frontend
npm run test -- --run
npm run test:e2e
```

If Playwright browsers are missing:

```bash
cd frontend
npx playwright install
```

Note: CI runs the same mirrored backend suite path shown above and uses PostgreSQL, not SQLite.

## 8. Docker Compose deployment flow

This project's `docker-compose.yml` expects an external PostgreSQL database such as Supabase.

1. Create the Docker env files:
   - `cp backend/.env.docker.example backend/.env.docker`
   - `cp frontend/.env.production.example frontend/.env.production`
2. Set these in `backend/.env.docker`:
   - `DATABASE_URL`
   - `DATABASE_MIGRATION_URL` if `DATABASE_URL` uses the Supabase pooler
   - `JWT_SECRET`
   - `FRONTEND_BASE_URL`
   - `BACKEND_BASE_URL`
   - `CLOUDFLARE_MEDIA_API_BASE_URL`
3. Start the stack:

```bash
docker compose up --build -d
```

For a one-command local Docker stack that also starts PostgreSQL, use:

```bash
bash scripts/setup-linux.sh
```

## Troubleshooting

- `JWT_SECRET` validation error: use a secret with at least 32 characters.
- Database connection failures: verify `DATABASE_URL`, `DATABASE_MIGRATION_URL` when used, SSL requirements, and network access to your Postgres host.
- Backend starts but frontend cannot log in: confirm `frontend/.env` points to `http://127.0.0.1:8000/api`.
- Proctoring uploads fail while using Cloudflare: verify `CLOUDFLARE_MEDIA_API_BASE_URL` and that your Cloudflare media gateway is reachable.
- Local file artifacts are written under `backend/storage`.
