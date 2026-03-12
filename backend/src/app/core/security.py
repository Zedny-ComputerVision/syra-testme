from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from jose import JWTError, jwt
from passlib.context import CryptContext

from .config import get_settings

password_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
REPORT_ACCESS_EXPIRE_DAYS = 7


def hash_password(password: str) -> str:
    return password_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    if not hashed_password:
        return False
    try:
        return password_context.verify(plain_password, hashed_password)
    except ValueError:
        return False


def _create_token(data: dict[str, Any], expires_delta: timedelta, token_type: str) -> str:
    settings = get_settings()
    to_encode = data.copy()
    issued_at = datetime.now(timezone.utc)
    to_encode.update(
        {
            "type": token_type,
            "iat": int(issued_at.timestamp()),
            "exp": issued_at + expires_delta,
        }
    )
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt


def create_access_token(
    sub: str,
    user_id: str,
    role: str,
    *,
    name: str | None = None,
    email: str | None = None,
) -> str:
    settings = get_settings()
    expire = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": sub, "user_id": user_id, "role": role, "name": name, "email": email}
    return _create_token(payload, expire, token_type="access")


def create_refresh_token(sub: str) -> str:
    settings = get_settings()
    expire = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    return _create_token({"sub": sub}, expire, token_type="refresh")


def create_password_reset_token(sub: str) -> str:
    settings = get_settings()
    expire = timedelta(minutes=settings.PASSWORD_RESET_EXPIRE_MINUTES)
    return _create_token({"sub": sub}, expire, token_type="password_reset")


def create_report_access_token(filename: str) -> str:
    expire = timedelta(days=REPORT_ACCESS_EXPIRE_DAYS)
    return _create_token({"sub": filename}, expire, token_type="report_access")


def verify_token(token: str, expected_type: Optional[str] = None) -> dict[str, Any]:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except JWTError as exc:  # pragma: no cover - jose already tested
        raise ValueError("Invalid token") from exc

    if expected_type and payload.get("type") != expected_type:
        raise ValueError("Invalid token type")
    return payload


def token_issued_at(payload: dict[str, Any]) -> datetime | None:
    try:
        issued_at = int(payload.get("iat"))
    except (TypeError, ValueError):
        return None
    return datetime.fromtimestamp(issued_at, timezone.utc)
