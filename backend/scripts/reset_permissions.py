"""Reset the permissions_config system setting to code defaults.

Run inside the Docker backend container:
  python scripts/reset_permissions.py

This overwrites whatever is stored in the database with the current
DEFAULT_PERMISSION_ROWS defined in src/app/api/deps.py, ensuring
all roles have the correct default access (e.g. learners can see
their dashboard, attempts, schedule, and take tests).
"""

from __future__ import annotations

import json
import logging
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from src.app.api.deps import DEFAULT_PERMISSION_ROWS
from src.app.core.config import get_settings
from src.app.models import SystemSettings

logger = logging.getLogger(__name__)

PERMISSIONS_CONFIG_KEY = "permissions_config"


def build_connect_args(database_url: str) -> dict[str, object]:
    connect_args: dict[str, object] = {"connect_timeout": 10}
    if ".pooler.supabase.com:6543" in database_url:
        connect_args["prepare_threshold"] = None
    return connect_args


def main() -> None:
    settings = get_settings()
    database_url = settings.DATABASE_URL
    engine = create_engine(
        database_url,
        poolclass=NullPool,
        pool_pre_ping=True,
        future=True,
        connect_args=build_connect_args(database_url),
    )
    session_factory = sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
        future=True,
    )

    db = session_factory()
    try:
        setting = db.scalar(
            select(SystemSettings).where(SystemSettings.key == PERMISSIONS_CONFIG_KEY)
        )
        new_value = json.dumps(DEFAULT_PERMISSION_ROWS)

        if setting:
            old_rows = json.loads(setting.value)
            logger.info("Existing permissions_config found (%d rows) — overwriting with defaults (%d rows).",
                        len(old_rows), len(DEFAULT_PERMISSION_ROWS))
            setting.value = new_value
            db.add(setting)
        else:
            logger.info("No permissions_config found — creating from defaults (%d rows).",
                        len(DEFAULT_PERMISSION_ROWS))
            setting = SystemSettings(key=PERMISSIONS_CONFIG_KEY, value=new_value)
            db.add(setting)

        db.commit()
        logger.info("Done. Permissions reset to defaults:")
        for row in DEFAULT_PERMISSION_ROWS:
            logger.info("  %-30s  admin=%-5s  instructor=%-5s  learner=%s",
                        row["feature"], row["admin"], row["instructor"], row["learner"])
    finally:
        db.close()
        engine.dispose()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")
    main()
