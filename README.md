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
- AI proctoring detectors are stubbed; integrate OpenCV/MediaPipe/YOLO for production.
- Reports are written to `backend/storage/reports`.
- Evidence screenshots are written to `backend/storage/evidence`.
