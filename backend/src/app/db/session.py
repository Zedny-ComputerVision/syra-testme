from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from ..core.config import get_settings

settings = get_settings()
engine_kwargs = {
    "pool_pre_ping": True,
    "future": True,
}

if settings.db_disable_pooling:
    engine_kwargs["poolclass"] = NullPool
else:
    engine_kwargs.update(
        {
            "pool_size": settings.DB_POOL_SIZE,
            "max_overflow": settings.DB_MAX_OVERFLOW,
            "pool_timeout": settings.DB_POOL_TIMEOUT_SECONDS,
            "pool_recycle": settings.DB_POOL_RECYCLE_SECONDS,
        }
    )

_connect_args = {}
# Supabase pooler (pgbouncer) — recycle connections aggressively to avoid
# stale connections, but allow a reasonable pool size since pgbouncer
# multiplexes app-side connections to a smaller set of DB connections.
if "supabase" in settings.DATABASE_URL or "pooler" in settings.DATABASE_URL:
    _connect_args["connect_timeout"] = 10
    if ".pooler.supabase.com:6543" in settings.DATABASE_URL:
        _connect_args["prepare_threshold"] = None
    if not settings.db_disable_pooling:
        engine_kwargs["pool_recycle"] = 120  # recycle every 2 min

engine = create_engine(settings.DATABASE_URL, connect_args=_connect_args, **engine_kwargs)
SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
    future=True,
)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
