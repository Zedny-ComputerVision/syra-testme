"""Ensure predictable login users exist for demo and staging deployments.

Run from backend folder:
  python scripts/ensure_login_users.py

Run inside the Docker backend container:
  python scripts/ensure_login_users.py

Environment overrides:
  SYRA_ADMIN_PASSWORD
  SYRA_INSTRUCTOR_PASSWORD
  SYRA_STUDENT_PASSWORD
  SYRA_RESET_LOGIN_PASSWORDS=1|0
"""

from __future__ import annotations

import logging
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from src.app.core.config import get_settings
from src.app.core.security import hash_password
from src.app.db.base import Base
from src.app.models import RoleEnum, User

logger = logging.getLogger(__name__)


def build_connect_args(database_url: str) -> dict[str, object]:
    connect_args: dict[str, object] = {"connect_timeout": 10}
    if ".pooler.supabase.com:6543" in database_url:
        connect_args["prepare_threshold"] = None
    return connect_args


def prepare_database(engine) -> None:
    max_attempts = 5
    for attempt in range(1, max_attempts + 1):
        try:
            Base.metadata.create_all(bind=engine)
            return
        except Exception:
            if attempt >= max_attempts:
                raise
            wait_seconds = 2 ** (attempt - 1)
            logger.warning(
                "Database not ready for login-user seed, retrying in %ss (attempt %s/%s)",
                wait_seconds,
                attempt,
                max_attempts,
            )
            time.sleep(wait_seconds)


def env_flag(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def unique_user_id(db, preferred: str) -> str:
    if not db.query(User).filter(User.user_id == preferred).first():
        return preferred
    suffix = 1
    while True:
        candidate = f"{preferred}_{suffix}"
        if not db.query(User).filter(User.user_id == candidate).first():
            return candidate
        suffix += 1


def ensure_user(
    db,
    *,
    email: str,
    name: str,
    preferred_user_id: str,
    role: RoleEnum,
    password: str,
    reset_passwords: bool,
) -> tuple[User, bool, bool]:
    user = db.query(User).filter(User.email == email).first()
    created = False
    password_reset = False

    if not user:
        user = User(
            email=email,
            name=name,
            user_id=unique_user_id(db, preferred_user_id),
            role=role,
            hashed_password=hash_password(password),
            is_active=True,
        )
        db.add(user)
        created = True
        password_reset = True
        return user, created, password_reset

    if reset_passwords:
        user.hashed_password = hash_password(password)
        password_reset = True

    user.is_active = True
    return user, created, password_reset


def main() -> None:
    settings = get_settings()
    connect_args = build_connect_args(settings.database_migration_url)
    engine = create_engine(
        settings.database_migration_url,
        poolclass=NullPool,
        pool_pre_ping=True,
        future=True,
        connect_args=connect_args,
    )
    session_factory = sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
        future=True,
    )

    prepare_database(engine)
    db = session_factory()

    reset_passwords = env_flag("SYRA_RESET_LOGIN_PASSWORDS", default=True)
    admin_password = os.getenv("SYRA_ADMIN_PASSWORD", "Admin1234!")
    instructor_password = os.getenv("SYRA_INSTRUCTOR_PASSWORD", "Instructor1234!")
    student_password = os.getenv("SYRA_STUDENT_PASSWORD", "Student1234!")

    try:
        seeded = [
            ensure_user(
                db,
                email="admin@example.com",
                name="Admin User",
                preferred_user_id="ADM001",
                role=RoleEnum.ADMIN,
                password=admin_password,
                reset_passwords=reset_passwords,
            ),
            ensure_user(
                db,
                email="instructor@example.com",
                name="Lead Instructor",
                preferred_user_id="INS001",
                role=RoleEnum.INSTRUCTOR,
                password=instructor_password,
                reset_passwords=reset_passwords,
            ),
            ensure_user(
                db,
                email="student1@example.com",
                name="Omar Hassan",
                preferred_user_id="STU001",
                role=RoleEnum.LEARNER,
                password=student_password,
                reset_passwords=reset_passwords,
            ),
            ensure_user(
                db,
                email="student2@example.com",
                name="Fatima Ali",
                preferred_user_id="STU002",
                role=RoleEnum.LEARNER,
                password=student_password,
                reset_passwords=reset_passwords,
            ),
        ]
        db.commit()

        revealed_passwords = {
            "admin@example.com": admin_password,
            "instructor@example.com": instructor_password,
            "student1@example.com": student_password,
            "student2@example.com": student_password,
        }

        for user, created, password_reset in seeded:
            logger.info(
                "ensured user email=%s role=%s created=%s password_reset=%s active=%s",
                user.email,
                user.role.value,
                created,
                password_reset,
                user.is_active,
            )
            if created or password_reset:
                logger.info("Login credentials: %s / %s", user.email, revealed_passwords[user.email])
            else:
                logger.info("Existing account kept its current password: %s", user.email)
    finally:
        db.close()
        engine.dispose()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")
    main()
