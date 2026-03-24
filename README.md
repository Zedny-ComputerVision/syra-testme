# SYRA LMS

Full-stack LMS with a FastAPI backend and React frontend.

## Setup Guides

- Windows: [docs/setup-windows.md](docs/setup-windows.md)
- Linux: [docs/setup-linux.md](docs/setup-linux.md)

## Quick Start

1. Copy `.env.example` to `.env`.
2. Copy `frontend/.env.example` to `frontend/.env`.
3. Set `DATABASE_URL` and `JWT_SECRET` in `.env`.
4. Optionally set `CLOUDFLARE_MEDIA_API_BASE_URL` if you want Cloudflare-backed proctoring video storage.
5. Follow the platform-specific guide above.

Default local URLs:

- Frontend: `http://127.0.0.1:5173`
- Backend API: `http://127.0.0.1:8000/api`
- Backend DB health check: `http://127.0.0.1:8000/api/health/db`

## Linux One-Command Stack

```bash
bash scripts/setup-linux.sh
```

That command now acts as the unified Linux bootstrap:
- creates `backend/.env.docker` if missing
- creates `frontend/.env.production` if missing
- fills or updates the important runtime values
- starts the full Docker stack

By default it chooses local PostgreSQL mode when `DATABASE_URL` points at `db`, seeds demo data, and brings the site up at `http://localhost`.
If `DATABASE_URL` points to an external database such as Supabase, it uses production-style mode instead and skips the mass demo seed.

Proctoring recordings use Cloudflare when `SYRA_CLOUDFLARE_MEDIA_API_BASE_URL` is set. Otherwise the setup script falls back to Supabase-backed video storage.

Default seeded credentials:

- `admin@example.com` / `Admin1234!`
- `instructor@example.com` / `Instructor1234!`
- `student1@example.com` / `Student1234!`
- `student2@example.com` / `Student1234!`

## Docker Deployment

### 1. Configure environment

```bash
cp backend/.env.docker.example backend/.env.docker
cp frontend/.env.production.example frontend/.env.production
# Optional for Supabase:
#   DATABASE_MIGRATION_URL (recommended when DATABASE_URL uses the Supabase pooler)
# Edit backend/.env.docker — at minimum set:
#   DATABASE_URL, JWT_SECRET, FRONTEND_BASE_URL, BACKEND_BASE_URL, CORS_ORIGINS
```

**Core** `backend/.env.docker` values for Docker:

| Variable | Example |
|---|---|
| `DATABASE_URL` | `postgresql+psycopg://user:pass@host:5432/syra_lms` |
| `DATABASE_MIGRATION_URL` | `postgresql+psycopg://postgres:[password]@db.[project-ref].supabase.co:5432/postgres?sslmode=require` |
| `JWT_SECRET` | Generate: `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `FRONTEND_BASE_URL` | `https://your-domain.com` |
| `BACKEND_BASE_URL` | `https://your-domain.com/api` |
| `CORS_ORIGINS` | `https://your-domain.com` |
| `CLOUDFLARE_MEDIA_API_BASE_URL` | `https://your-cloudflare-media-gateway.example/api` optional |

**Optional** backend tuning:

| Variable | Default | Notes |
|---|---|---|
| `MAX_VIDEO_UPLOAD_MB` | `512` | Max proctoring video upload size |
| `MEDIA_STORAGE_PROVIDER` | `local` | `local` or `supabase` |
| `PROCTORING_VIDEO_STORAGE_PROVIDER` | `cloudflare` | Use `cloudflare` with `CLOUDFLARE_MEDIA_API_BASE_URL`, or `supabase` to keep proctoring video storage inside Supabase |

Supabase production note:

- Use the Supabase session pooler URL for `DATABASE_URL`.
- Use the direct Postgres URL for `DATABASE_MIGRATION_URL` if you want migrations to run outside the pooler.
- Supabase URLs will automatically get `sslmode=require` added if omitted.

### 2. One-command production deploy

```bash
SYRA_DATABASE_URL='postgresql+psycopg://user:pass@host:5432/dbname?sslmode=require' \
SYRA_FRONTEND_URL=http://167.172.169.79 \
SYRA_BACKEND_URL=http://167.172.169.79/api \
bash scripts/setup-linux.sh --production
```

That command creates the Docker env files if they do not exist yet, generates a persistent `JWT_SECRET` when needed, starts the production stack, waits for container health, and verifies the frontend plus backend health endpoints.

`bash scripts/deploy-linux.sh` still works, but it now just forwards to `bash scripts/setup-linux.sh --production`.

To also ensure demo login users exist with predictable passwords during deploy:

```bash
SYRA_DATABASE_URL='postgresql+psycopg://user:pass@host:5432/dbname?sslmode=require' \
SYRA_FRONTEND_URL=http://167.172.169.79 \
SYRA_BACKEND_URL=http://167.172.169.79/api \
SYRA_SEED_LOGIN_USERS=1 \
bash scripts/setup-linux.sh --production
```

Default seeded login credentials for that opt-in path:

- `admin@example.com` / `Admin1234!`
- `instructor@example.com` / `Instructor1234!`
- `student1@example.com` / `Student1234!`
- `student2@example.com` / `Student1234!`

### 3. Build and start manually

```bash
# Create storage directory (bind-mounted volume)
mkdir -p backend/storage

# Build and launch
docker compose up --build -d

# Verify health
docker compose ps
curl http://localhost/api/health/db
```

### 4. Architecture

```
Internet → :80 nginx (frontend) → /api/* proxy → :8000 gunicorn (backend) → PostgreSQL
                                 → /*  SPA files
```

- **Frontend**: nginx serves the React SPA and reverse-proxies `/api/` to the backend
- **Backend**: gunicorn with uvicorn workers, auto-applies Alembic migrations on startup
- **Storage**: `backend/storage/` is bind-mounted for videos, evidence, reports, identity files
- Backend port is **not** exposed externally — all traffic goes through nginx

### 5. Local PostgreSQL Shortcut

For a local Linux Docker stack that also starts PostgreSQL, use:

```bash
bash scripts/setup-linux.sh
```

## Notes

- AI proctoring uses YOLO + MediaPipe + DeepFace for face/object detection. Models are pre-warmed at startup.
- The one-command Linux setup uses Cloudflare for proctoring videos only when `SYRA_CLOUDFLARE_MEDIA_API_BASE_URL` is set. Otherwise it falls back to Supabase-backed video storage.
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
- CI uses the same mirrored backend suite path and a PostgreSQL service rather than SQLite
