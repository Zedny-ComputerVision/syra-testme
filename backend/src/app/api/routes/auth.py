import uuid
import asyncio

from fastapi import APIRouter, Depends, HTTPException, status, Request, BackgroundTasks
from slowapi.util import get_remote_address
from slowapi import Limiter
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...core.config import get_settings
from ...core.security import (
    create_access_token,
    create_refresh_token,
    create_password_reset_token,
    hash_password,
    verify_password,
    verify_token,
)
from ...models import User, RoleEnum, SystemSettings
from ...schemas import (
    Token, TokenRefresh, UserCreate, UserRead, Message, LoginRequest, RefreshRequest,
    ChangePasswordRequest, ResetPasswordRequest, ForgotPasswordRequest,
)
from pydantic import BaseModel, EmailStr, field_validator


class SignupRequest(BaseModel):
    email: EmailStr
    name: str
    user_id: str
    password: str

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: EmailStr | str) -> str:
        return str(value).strip().lower()

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        text = str(value or "").strip()
        if not text:
            raise ValueError("Name is required")
        return text

    @field_validator("user_id")
    @classmethod
    def validate_user_id(cls, value: str) -> str:
        text = str(value or "").strip()
        if not text:
            raise ValueError("User ID is required")
        return text

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if len(value or "") < 8:
            raise ValueError("Password must be at least 8 characters")
        return value

from ..deps import get_current_user, get_db_dep
from ...services.email import (
    get_email_delivery_status,
    send_welcome_email,
    send_password_reset_email,
    send_admin_setup_email,
    send_password_changed_email,
)
from ...services.audit import write_audit_log

router = APIRouter()
settings = get_settings()
limiter = Limiter(key_func=get_remote_address)


def _run_email_background_task(email_task, *args):
    asyncio.run(email_task(*args))


def _bg_send_admin_setup_email(user):
    _run_email_background_task(send_admin_setup_email, user)


def _bg_send_welcome_email(user):
    _run_email_background_task(send_welcome_email, user)


def _bg_send_password_changed_email(user):
    _run_email_background_task(send_password_changed_email, user)


def _bg_send_password_reset_email(user, token: str):
    _run_email_background_task(send_password_reset_email, user, token)


@router.post("/setup", response_model=UserRead)
async def setup_admin(body: UserCreate, background: BackgroundTasks, db: Session = Depends(get_db_dep)):
    users_exist = db.scalar(select(User.id).limit(1))
    if users_exist:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Admin already set up")
    user = User(
        email=body.email,
        name=body.name,
        user_id=body.user_id,
        hashed_password=hash_password(body.password),
        role=RoleEnum.ADMIN,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    background.add_task(_bg_send_admin_setup_email, user)
    return user


def _signup_allowed(db: Session) -> bool:
    setting = db.scalar(select(SystemSettings).where(SystemSettings.key == "allow_signup"))
    return (setting and str(setting.value).lower() in {"1", "true", "yes"}) or False


@router.get("/signup-status")
async def signup_status(db: Session = Depends(get_db_dep)):
    return {"allowed": _signup_allowed(db)}


@router.post("/signup", response_model=Message)
@limiter.limit(settings.RATE_LIMIT_LOGIN)
async def signup(request: Request, body: SignupRequest, background: BackgroundTasks, db: Session = Depends(get_db_dep)):
    if not _signup_allowed(db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Self sign-up disabled")
    existing = db.scalar(select(User).where((User.email == body.email) | (User.user_id == body.user_id)))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Account already exists")
    user = User(
        email=body.email,
        name=body.name,
        user_id=body.user_id,
        hashed_password=hash_password(body.password),
        role=RoleEnum.LEARNER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    background.add_task(_bg_send_welcome_email, user)
    return Message(detail="Signup successful. Please check your email and log in.")


@router.post("/login", response_model=Token)
@limiter.limit(settings.RATE_LIMIT_LOGIN)
async def login(request: Request, body: LoginRequest, db: Session = Depends(get_db_dep)):
    email = str(body.email).strip().lower()
    stmt = select(User).where(User.email == email)
    user = db.scalar(stmt)
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")
    access_token = create_access_token(
        str(user.id),
        user.user_id,
        user.role.value,
        name=user.name,
        email=user.email,
    )
    refresh_token = create_refresh_token(str(user.id))
    write_audit_log(
        db,
        user.id,
        action="USER_LOGIN",
        resource_type="user",
        resource_id=str(user.id),
        detail="Successful login",
        ip_address=request.client.host if request.client else None,
    )
    return Token(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=TokenRefresh)
async def refresh(body: RefreshRequest, db: Session = Depends(get_db_dep)):
    try:
        payload = verify_token(body.refresh_token, expected_type="refresh")
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    sub = payload.get("sub")
    try:
        user_pk = uuid.UUID(sub) if isinstance(sub, str) else sub
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = db.get(User, user_pk)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")
    new_access = create_access_token(
        str(user.id),
        user.user_id,
        user.role.value,
        name=user.name,
        email=user.email,
    )
    return TokenRefresh(access_token=new_access)


@router.get("/me", response_model=UserRead)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/logout", response_model=Message)
async def logout(
    request: Request,
    db: Session = Depends(get_db_dep),
    current_user: User = Depends(get_current_user),
):
    write_audit_log(
        db,
        current_user.id,
        action="USER_LOGOUT",
        resource_type="user",
        resource_id=str(current_user.id),
        detail="User logged out",
        ip_address=request.client.host if request.client else None,
    )
    return Message(detail="Logged out")


@router.post("/change-password", response_model=Message)
async def change_password(
    body: ChangePasswordRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_db_dep),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Incorrect current password")
    current_user.hashed_password = hash_password(body.new_password)
    db.add(current_user)
    db.commit()
    write_audit_log(
        db,
        current_user.id,
        action="PASSWORD_CHANGED",
        resource_type="user",
        resource_id=str(current_user.id),
        detail="Password changed by authenticated user",
    )
    background.add_task(_bg_send_password_changed_email, current_user)
    return Message(detail="Password updated")


@router.post("/forgot-password", status_code=202, response_model=Message)
@limiter.limit(settings.RATE_LIMIT_LOGIN)
async def forgot_password(request: Request, body: ForgotPasswordRequest, background: BackgroundTasks, db: Session = Depends(get_db_dep)):
    email_ready, email_error = get_email_delivery_status()
    if not email_ready:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=email_error or "Password reset is temporarily unavailable.",
        )
    email = str(body.email).strip().lower()
    user = db.scalar(select(User).where(User.email == email))
    if user:
        token = create_password_reset_token(str(user.id))
        background.add_task(_bg_send_password_reset_email, user, token)
    return Message(detail="If the email exists, a reset link was sent")


@router.post("/reset-password", response_model=Message)
async def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db_dep)):
    try:
        payload = verify_token(body.token, expected_type="password_reset")
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    sub = payload.get("sub")
    try:
        user_pk = uuid.UUID(sub) if isinstance(sub, str) else sub
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = db.get(User, user_pk)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.hashed_password = hash_password(body.new_password)
    db.add(user)
    db.commit()
    write_audit_log(
        db,
        user.id,
        action="PASSWORD_RESET",
        resource_type="user",
        resource_id=str(user.id),
        detail="Password reset via token",
    )
    return Message(detail="Password reset successful")
