from __future__ import annotations

import os
import re
import uuid

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url


def get_test_database_url() -> str:
    explicit = os.getenv("TEST_DATABASE_URL")
    if explicit:
        return explicit

    base = os.getenv("DATABASE_URL", "postgresql+psycopg://postgres:password@localhost:5432/syra_lms")
    url = make_url(base)
    database = f"{url.database}_test" if url.database and not str(url.database).endswith("_test") else (url.database or "syra_lms_test")
    return url.set(database=database).render_as_string(hide_password=False)


def isolated_test_database_url() -> str:
    url = make_url(get_test_database_url())
    base_name = str(url.database or "syra_lms_test")
    database_name = f"{base_name}_{uuid.uuid4().hex[:8]}"
    return url.set(database=database_name).render_as_string(hide_password=False)


def ensure_postgres_database(database_url: str | None = None) -> str:
    resolved_url = database_url or get_test_database_url()
    url = make_url(resolved_url)
    database_name = str(url.database or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_]+", database_name):
        raise ValueError(f"Unsupported test database name: {database_name}")

    admin_database = os.getenv("TEST_ADMIN_DATABASE", "postgres")
    admin_url = url.set(database=admin_database).render_as_string(hide_password=False)
    admin_engine = create_engine(admin_url, isolation_level="AUTOCOMMIT", future=True)
    try:
        with admin_engine.connect() as connection:
            exists = connection.scalar(
                text("SELECT 1 FROM pg_database WHERE datname = :database_name"),
                {"database_name": database_name},
            )
            if not exists:
                connection.execute(text(f'CREATE DATABASE "{database_name}"'))
    finally:
        admin_engine.dispose()

    return url.render_as_string(hide_password=False)


def create_test_engine():
    database_url = ensure_postgres_database(isolated_test_database_url())
    engine = create_engine(database_url, pool_pre_ping=True, future=True)
    engine.test_database_url = database_url
    return engine


def drop_postgres_database(database_url: str) -> None:
    url = make_url(database_url)
    database_name = str(url.database or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_]+", database_name):
        raise ValueError(f"Unsupported test database name: {database_name}")

    admin_database = os.getenv("TEST_ADMIN_DATABASE", "postgres")
    admin_url = url.set(database=admin_database).render_as_string(hide_password=False)
    admin_engine = create_engine(admin_url, isolation_level="AUTOCOMMIT", future=True)
    try:
        with admin_engine.connect() as connection:
            connection.execute(
                text(
                    "SELECT pg_terminate_backend(pid) "
                    "FROM pg_stat_activity "
                    "WHERE datname = :database_name AND pid <> pg_backend_pid()"
                ),
                {"database_name": database_name},
            )
            connection.execute(text(f'DROP DATABASE IF EXISTS "{database_name}"'))
    finally:
        admin_engine.dispose()
