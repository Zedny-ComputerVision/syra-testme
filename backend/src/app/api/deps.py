import uuid
import json
import os
import time
from threading import Lock
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func, select
from sqlalchemy.orm import Session, load_only

from ..core.config import get_settings
from ..core.security import token_issued_at, verify_token
from ..db.session import get_db
from ..core.i18n import translate as _t
from ..models import Exam, ExamStatus, RoleEnum, Schedule, SystemSettings, User

security = HTTPBearer()
FEATURE_ALIASES = {
    "Create Exams": "Create Tests",
    "Edit Exams": "Edit Tests",
    "Delete Exams": "Delete Tests",
    "Take Exams": "Take Tests",
}
DEFAULT_PERMISSION_ROWS = [
    {"feature": "View Dashboard", "admin": True, "instructor": True, "learner": True},
    {"feature": "Manage Users", "admin": True, "instructor": False, "learner": False},
    {"feature": "Create Tests", "admin": True, "instructor": False, "learner": False},
    {"feature": "Edit Tests", "admin": True, "instructor": False, "learner": False},
    {"feature": "Delete Tests", "admin": True, "instructor": False, "learner": False},
    {"feature": "Manage Categories", "admin": True, "instructor": False, "learner": False},
    {"feature": "Manage Grading Scales", "admin": True, "instructor": False, "learner": False},
    {"feature": "Manage Question Pools", "admin": True, "instructor": False, "learner": False},
    {"feature": "Assign Schedules", "admin": True, "instructor": False, "learner": False},
    {"feature": "View Attempt Analysis", "admin": True, "instructor": True, "learner": False},
    {"feature": "Generate Reports", "admin": True, "instructor": False, "learner": False},
    {"feature": "Take Tests", "admin": False, "instructor": False, "learner": True},
    {"feature": "View Own Attempts", "admin": True, "instructor": True, "learner": True},
    {"feature": "View Own Schedule", "admin": True, "instructor": True, "learner": True},
    {"feature": "View Audit Log", "admin": True, "instructor": False, "learner": False},
    {"feature": "Manage Roles", "admin": True, "instructor": False, "learner": False},
    {"feature": "System Settings", "admin": True, "instructor": False, "learner": False},
    {"feature": "proctoring.admin", "admin": True, "instructor": False, "learner": False},
]
PERMISSION_ROWS_CACHE_TTL_SECONDS = 60.0
_permission_rows_cache: dict[str, dict[str, object]] = {}
_permission_rows_cache_lock = Lock()


def get_db_dep():
    yield from get_db()


def parse_uuid_param(
    raw_value: str,
    *,
    detail: str = "Not found",
    status_code: int = status.HTTP_404_NOT_FOUND,
) -> uuid.UUID:
    try:
        return uuid.UUID(raw_value)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status_code, detail=detail)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db_dep),
) -> User:
    token = credentials.credentials
    try:
        payload = verify_token(token, expected_type="access")
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_t("invalid_token"))
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_t("invalid_token"))
    try:
        user_pk = uuid.UUID(user_id) if isinstance(user_id, str) else user_id
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_t("invalid_token"))

    user = db.scalar(
        select(User)
        .options(
            load_only(
                User.id,
                User.user_id,
                User.email,
                User.name,
                User.role,
                User.is_active,
                User.token_invalid_before,
            )
        )
        .where(User.id == user_pk)
    )
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_t("user_not_found"))
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=_t("inactive_user"))
    issued_at = normalize_utc_datetime(token_issued_at(payload))
    cutoff = normalize_utc_datetime(getattr(user, "token_invalid_before", None))
    if issued_at is None or (cutoff is not None and issued_at < cutoff):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_t("invalid_token"))
    return user


def require_role(*roles: RoleEnum):
    def _wrapper(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=_t("insufficient_permissions"))
        return user

    return _wrapper


def role_key(role: RoleEnum | str | None) -> str:
    return str(getattr(role, "value", role) or "").lower()


def normalize_utc_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def normalize_feature(feature: str | None) -> str:
    value = str(feature or "").strip()
    return FEATURE_ALIASES.get(value, value)


def permission_defaults_enabled() -> bool:
    settings = get_settings()
    return bool(getattr(settings, "E2E_SEED_ENABLED", False) or os.getenv("PYTEST_CURRENT_TEST"))


def _permissions_config_unavailable() -> None:
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=_t("permissions_config_unavailable"),
    )


def canonicalize_permission_rows(rows):
    source = rows if isinstance(rows, list) else []
    merged: dict[str, dict] = {}
    for row in source:
        if not isinstance(row, dict) or not row.get("feature"):
            continue
        feature = normalize_feature(row.get("feature"))
        existing = merged.get(feature, {"feature": feature, "admin": False, "instructor": False, "learner": False})
        merged[feature] = {
            **existing,
            "admin": existing["admin"] or row.get("admin") is True,
            "instructor": existing["instructor"] or row.get("instructor") is True,
            "learner": existing["learner"] or row.get("learner") is True,
        }
    return list(merged.values())


def load_permission_rows(db: Session):
    scalar = getattr(db, "scalar", None)
    allow_defaults = permission_defaults_enabled()
    if not callable(scalar):
        if allow_defaults:
            return DEFAULT_PERMISSION_ROWS
        _permissions_config_unavailable()

    cache_key = _permission_rows_cache_key(db)
    now = time.monotonic()
    cached = _permission_rows_cache.get(cache_key)
    if cached and float(cached.get("expires_at", 0.0) or 0.0) > now:
        return _clone_permission_rows(cached.get("rows"))

    setting = scalar(select(SystemSettings).where(SystemSettings.key == "permissions_config"))
    if not setting or not setting.value:
        if allow_defaults:
            rows = DEFAULT_PERMISSION_ROWS
            _write_permission_rows_cache(cache_key, rows, now=now)
            return _clone_permission_rows(rows)
        _permissions_config_unavailable()
    try:
        parsed = json.loads(setting.value)
    except Exception:
        if allow_defaults:
            rows = DEFAULT_PERMISSION_ROWS
            _write_permission_rows_cache(cache_key, rows, now=now)
            return _clone_permission_rows(rows)
        _permissions_config_unavailable()
    rows = canonicalize_permission_rows(parsed)
    if not rows:
        if allow_defaults:
            rows = DEFAULT_PERMISSION_ROWS
            _write_permission_rows_cache(cache_key, rows, now=now)
            return _clone_permission_rows(rows)
        _permissions_config_unavailable()
    _write_permission_rows_cache(cache_key, rows, now=now)
    return _clone_permission_rows(rows)


def invalidate_permission_rows_cache(db: Session | None = None):
    with _permission_rows_cache_lock:
        if db is None:
            _permission_rows_cache.clear()
            return
        _permission_rows_cache.pop(_permission_rows_cache_key(db), None)


def permission_allowed(rows, role: RoleEnum | str | None, feature: str | None) -> bool:
    if not feature:
        return False
    current_role = role_key(role)
    requested_feature = normalize_feature(feature)
    source = canonicalize_permission_rows(rows)
    return any(
        isinstance(row, dict)
        and normalize_feature(row.get("feature")) == requested_feature
        and row.get(current_role) is True
        for row in source
    )


def ensure_permission(db: Session, user: User, feature: str):
    if not permission_allowed(load_permission_rows(db), user.role, feature):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=_t("insufficient_permissions"))


def exam_owned_by_user(exam: Exam | None, user: User | None) -> bool:
    if not exam or not user or user.role not in {RoleEnum.ADMIN, RoleEnum.INSTRUCTOR}:
        return False
    return getattr(exam, "created_by_id", None) == getattr(user, "id", None)


def ensure_exam_owner(
    exam: Exam | None,
    user: User,
    *,
    detail: str = "Test not found",
    status_code: int = status.HTTP_404_NOT_FOUND,
) -> None:
    if user.role in {RoleEnum.ADMIN, RoleEnum.INSTRUCTOR} and not exam_owned_by_user(exam, user):
        raise HTTPException(status_code=status_code, detail=detail)


def learner_can_access_exam(db: Session, exam: Exam | None, user: User, *, now: datetime | None = None) -> bool:
    if not exam or user.role != RoleEnum.LEARNER:
        return bool(exam)
    if exam.status != ExamStatus.OPEN:
        return False
    current_time = normalize_utc_datetime(now or datetime.now(timezone.utc))
    schedule = db.scalar(
        select(Schedule).where(
            Schedule.exam_id == exam.id,
            Schedule.user_id == user.id,
        )
    )
    if not schedule:
        return False
    scheduled_at = normalize_utc_datetime(getattr(schedule, "scheduled_at", None))
    if scheduled_at and current_time and scheduled_at > current_time:
        return False
    return True


def require_permission(feature: str, *roles: RoleEnum):
    def _wrapper(
        user: User = Depends(get_current_user),
        db: Session = Depends(get_db_dep),
    ) -> User:
        if roles and user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=_t("insufficient_permissions"))
        ensure_permission(db, user, feature)
        return user

    return _wrapper


def _permission_rows_cache_key(db: Session) -> str:
    try:
        bind = db.get_bind()
        url = getattr(bind, "url", None)
        if url:
            return str(url)
        engine = getattr(bind, "engine", None)
        if engine is not None and getattr(engine, "url", None):
            return str(engine.url)
    except Exception:
        pass
    cache_key = getattr(db, "__permission_rows_cache_key__", None)
    if cache_key:
        return cache_key
    cache_key = f"session:{id(db)}:{time.monotonic_ns()}"
    try:
        setattr(db, "__permission_rows_cache_key__", cache_key)
    except Exception:
        pass
    return cache_key


def _clone_permission_rows(rows) -> list[dict]:
    source = canonicalize_permission_rows(rows)
    return [dict(row) for row in source]


def _write_permission_rows_cache(cache_key: str, rows, *, now: float | None = None):
    global _permission_rows_cache
    current_now = now if now is not None else time.monotonic()
    expires_at = current_now + PERMISSION_ROWS_CACHE_TTL_SECONDS
    with _permission_rows_cache_lock:
        _permission_rows_cache[cache_key] = {
            "rows": _clone_permission_rows(rows),
            "expires_at": expires_at,
        }
        if len(_permission_rows_cache) > 1000:
            _permission_rows_cache = {
                k: v for k, v in _permission_rows_cache.items()
                if float(v.get("expires_at", 0.0) or 0.0) > current_now
            }
