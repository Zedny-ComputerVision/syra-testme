import logging
from pathlib import Path
from contextlib import asynccontextmanager
import os
import sys

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi.middleware import SlowAPIMiddleware
import asyncio
from datetime import datetime, timezone

from .api.router import router as api_router
from .core.config import get_settings
from .core.limiter import limiter
from .db import session
from .db.base import Base
from .db.session import SessionLocal
from sqlalchemy import select, text
from .models import ReportSchedule
from .api.routes.report_schedules import run_report_schedule
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("syra")

settings = get_settings()
BASE_DIR = Path(__file__).resolve().parent.parent.parent  # backend/src/app -> backend
EVIDENCE_DIR = BASE_DIR / "storage" / "evidence"
REPORTS_DIR = BASE_DIR / "storage" / "reports"
VIDEOS_DIR = BASE_DIR / "storage" / "videos"
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
REPORTS_DIR.mkdir(parents=True, exist_ok=True)
VIDEOS_DIR.mkdir(parents=True, exist_ok=True)

# Parse allowed CORS origins; fall back to explicit list so credentials work.
_raw_origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
ALLOWED_ORIGINS = _raw_origins if _raw_origins and _raw_origins != ["*"] else [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app = FastAPI(title="SYRA LMS", redirect_slashes=False)

TRAILING_RESOURCES = {
    "/api/courses",
    "/api/nodes",
    "/api/exams",
    "/api/questions",
    "/api/attempts",
    "/api/schedules",
    "/api/categories",
    "/api/grading-scales",
    "/api/question-pools",
    "/api/dashboard",
    "/api/notifications",
    "/api/surveys",
    "/api/user-groups",
    "/api/exam-templates",
    "/api/report-schedules",
    "/api/audit-log",
    "/api/admin-settings",
    "/api/proctoring",
    "/api/admin/tests",
}


class TrailingSlashNormalizeMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.scope.get("path", "")
        # If request hits a known resource root without slash, rewrite path to include slash without redirect.
        if path in TRAILING_RESOURCES and not path.endswith("/"):
            request.scope["path"] = path + "/"
            request.scope["raw_path"] = (path + "/").encode()
        return await call_next(request)


if settings.DEV_LOG_REQUESTS:
    class LogRequestsMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next):
            rid = request.headers.get("x-request-id") or str(id(request))
            logger.info("REQ %s %s %s", rid, request.method, request.url.path)
            response = await call_next(request)
            logger.info("RES %s %s %s", rid, response.status_code, request.url.path)
            return response
    app.add_middleware(LogRequestsMiddleware)

app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)
# Normalize path before CORS so preflights/post match expected route
app.add_middleware(TrailingSlashNormalizeMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Safety net: ensure CORS header exists on all responses for allowed origins
class EnsureCORSHeaders(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        origin = request.headers.get("origin")
        if origin and (origin in ALLOWED_ORIGINS or "*" in ALLOWED_ORIGINS):
            if "access-control-allow-origin" not in {k.lower() for k in response.headers.keys()}:
                response.headers["Access-Control-Allow-Origin"] = origin
                response.headers["Access-Control-Allow-Credentials"] = "true"
        return response

app.add_middleware(EnsureCORSHeaders)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Ensure CORS headers are present even on unhandled 500 errors."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    origin = request.headers.get("origin", "")
    headers: dict[str, str] = {}
    if origin and (origin in ALLOWED_ORIGINS or "*" in ALLOWED_ORIGINS):
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
        headers=headers,
    )


app.include_router(api_router, prefix="/api")

app.mount("/evidence", StaticFiles(directory=str(EVIDENCE_DIR)), name="evidence")
app.mount("/reports", StaticFiles(directory=str(REPORTS_DIR)), name="reports")
app.mount("/videos", StaticFiles(directory=str(VIDEOS_DIR)), name="videos")


def _run_startup_initialization() -> None:
    try:
        Base.metadata.create_all(bind=session.engine)
        logger.info("Database tables created/verified (DB: %s)", settings.DATABASE_URL.split("@")[-1])
    except Exception as exc:
        logger.error("DB startup error - check DATABASE_URL in .env: %s", exc)

    # Lightweight column backfill for SQLite deployments (idempotent)
    if session.engine.dialect.name == "sqlite":
        def ensure_column(conn, table: str, column: str, ddl: str):
            cols = [row[1] for row in conn.execute(text(f"PRAGMA table_info({table})")).all()]
            if column not in cols:
                conn.execute(text(ddl))
                logger.info("Added missing column %s.%s", table, column)

        try:
            with session.engine.begin() as conn:
                ensure_column(conn, "attempts", "face_signature", "ALTER TABLE attempts ADD COLUMN face_signature JSON")
                ensure_column(conn, "attempts", "base_head_pose", "ALTER TABLE attempts ADD COLUMN base_head_pose JSON")
                ensure_column(conn, "attempts", "id_doc_path", "ALTER TABLE attempts ADD COLUMN id_doc_path VARCHAR(512)")
                ensure_column(conn, "attempts", "selfie_path", "ALTER TABLE attempts ADD COLUMN selfie_path VARCHAR(512)")
                ensure_column(conn, "attempts", "id_text", "ALTER TABLE attempts ADD COLUMN id_text JSON")
                ensure_column(conn, "attempts", "id_verified", "ALTER TABLE attempts ADD COLUMN id_verified BOOLEAN")
                ensure_column(conn, "attempts", "lighting_score", "ALTER TABLE attempts ADD COLUMN lighting_score FLOAT")
                ensure_column(conn, "attempts", "precheck_passed_at", "ALTER TABLE attempts ADD COLUMN precheck_passed_at DATETIME")
        except Exception as exc:
            logger.warning("Schema backfill skipped: %s", exc)

    # Cross-db compatibility backfill for schedules.test_id used by tests scheduling.
    try:
        with session.engine.begin() as conn:
            if session.engine.dialect.name == "postgresql":
                cols = conn.execute(text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_schema = 'public' AND table_name = 'schedules'"
                )).scalars().all()
                if "test_id" not in cols:
                    conn.execute(text("ALTER TABLE schedules ADD COLUMN test_id UUID"))
                    logger.info("Added missing column schedules.test_id")
            elif session.engine.dialect.name == "sqlite":
                cols = [row[1] for row in conn.execute(text("PRAGMA table_info(schedules)")).all()]
                if "test_id" not in cols:
                    conn.execute(text("ALTER TABLE schedules ADD COLUMN test_id CHAR(36)"))
                    logger.info("Added missing column schedules.test_id")
    except Exception as exc:
        logger.warning("Schedule schema backfill skipped: %s", exc)


async def _schedule_loop():
    from croniter import croniter

    while True:
        try:
            with SessionLocal() as db:
                schedules = db.scalars(
                    select(ReportSchedule).where(ReportSchedule.is_active.is_(True))
                ).all()
                now = datetime.now(timezone.utc)
                for sched in schedules:
                    if not sched.schedule_cron:
                        continue
                    base = sched.last_run_at or now
                    try:
                        itr = croniter(sched.schedule_cron, base)
                        next_time = itr.get_next(datetime)
                    except Exception:
                        continue
                    if next_time <= now:
                        run_report_schedule(db, sched)
        except Exception as exc:
            logger.error("Report scheduler error: %s", exc)
        await asyncio.sleep(60)


async def _purge_identity_loop():
    while True:
        try:
            ident_dir = BASE_DIR / "storage" / "identity"
            ident_dir.mkdir(parents=True, exist_ok=True)
            cutoff = datetime.now(timezone.utc).timestamp() - 24 * 3600
            for f in ident_dir.glob("*.bin"):
                if f.stat().st_mtime < cutoff:
                    f.unlink(missing_ok=True)
        except Exception as exc:
            logger.error("Identity purge error: %s", exc)
        await asyncio.sleep(3600)


@asynccontextmanager
async def lifespan(_: FastAPI):
    _run_startup_initialization()
    is_test_env = "pytest" in sys.modules or "PYTEST_CURRENT_TEST" in os.environ
    background_tasks = [] if is_test_env else [
        asyncio.create_task(_schedule_loop()),
        asyncio.create_task(_purge_identity_loop()),
    ]
    try:
        yield
    finally:
        for task in background_tasks:
            task.cancel()
        await asyncio.gather(*background_tasks, return_exceptions=True)


app.router.lifespan_context = lifespan
