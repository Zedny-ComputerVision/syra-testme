# SYRA LMS

Full-stack LMS with FastAPI backend and React frontend. This is a scaffold matching the requested architecture.

## Backend

```bash
cd backend
python -m venv .venv
. .venv/Scripts/activate  # or source .venv/bin/activate
pip install -r requirements.txt
uvicorn src.app.main:app --reload --host 0.0.0.0 --port 8000
```

Seed demo data:
```bash
python scripts/seed_demo_data.py
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Env files already populated with local defaults.

## Notes
- AI proctoring uses optional computer-vision/OCR backends with heuristic fallbacks. For strongest production accuracy, install and configure the heavier detector dependencies the deployment will rely on.
- Proctoring video uploads stream through Cloudflare. Set `CLOUDFLARE_MEDIA_API_BASE_URL` in the backend env before running recorded exams.
- Reports are written to `backend/storage/reports`.
- Evidence screenshots are written to `backend/storage/evidence`.

## Full test run

Run the full suite (backend tests + frontend unit tests + frontend end-to-end tests):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-full-tests.ps1
```

You can skip Playwright/E2E with:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-full-tests.ps1 -SkipFrontendE2E
```

Requirements for the backend test run:
- Postgres available at `DATABASE_URL` (or local default `postgresql+psycopg://postgres:password@localhost:5432/syra_lms`)
- Frontend E2E depends on Playwright dependencies already installed (`npm install` in `frontend` is already set up in the project).
