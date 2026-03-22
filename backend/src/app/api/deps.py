import uuid
import json
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..core.security import token_issued_at, verify_token
from ..db.session import get_db
from ..models import AccessMode, Exam, ExamStatus, RoleEnum, Schedule, SystemSettings, User

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
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    try:
        user_pk = uuid.UUID(user_id) if isinstance(user_id, str) else user_id
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = db.get(User, user_pk)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")
    issued_at = token_issued_at(payload)
    cutoff = normalize_utc_datetime(getattr(user, "token_invalid_before", None))
    cutoff_seconds = int(cutoff.timestamp()) if cutoff else None
    issued_seconds = int(issued_at.timestamp()) if issued_at else None
    if issued_seconds is None or (cutoff_seconds is not None and issued_seconds < cutoff_seconds):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return user


def require_role(*roles: RoleEnum):
    def _wrapper(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
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


def canonicalize_permission_rows(rows):
    source = rows if isinstance(rows, list) and rows else DEFAULT_PERMISSION_ROWS
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
    return list(merged.values()) or DEFAULT_PERMISSION_ROWS


def load_permission_rows(db: Session):
    scalar = getattr(db, "scalar", None)
    if not callable(scalar):
        return DEFAULT_PERMISSION_ROWS
    setting = scalar(select(SystemSettings).where(SystemSettings.key == "permissions_config"))
    if not setting or not setting.value:
        return DEFAULT_PERMISSION_ROWS
    try:
        parsed = json.loads(setting.value)
    except Exception:
        return DEFAULT_PERMISSION_ROWS
    return canonicalize_permission_rows(parsed)


def permission_allowed(rows, role: RoleEnum | str | None, feature: str | None) -> bool:
    if not feature:
        return True
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
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")


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
    restricted_exists = (
        db.scalar(
            select(func.count())
            .select_from(Schedule)
            .where(
                Schedule.exam_id == exam.id,
                Schedule.access_mode == AccessMode.RESTRICTED,
            )
        )
        or 0
    ) > 0
    if restricted_exists and not schedule:
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
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        ensure_permission(db, user, feature)
        return user

    return _wrapper
