from __future__ import annotations

import asyncio

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status

from ...api.deps import get_current_user, get_db_dep
from ...core.config import get_settings
from ...core.limiter import limiter
from ...models import User
from ...utils.request_ip import get_request_ip
from ...services.email import (
    get_email_delivery_status,
    send_password_changed_email,
    send_password_reset_email,
    send_welcome_email,
)
from .repository import AuthRepository
from .schemas import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    Message,
    RefreshRequest,
    ResetPasswordRequest,
    SignupRequest,
    Token,
    TokenRefresh,
    UserRead,
)
from .service import AuthService


router = APIRouter()
settings = get_settings()


def _service_from_db(db=Depends(get_db_dep)) -> AuthService:
    return AuthService(AuthRepository(db))


def _request_ip(request: Request | None) -> str | None:
    return get_request_ip(request)


async def _bg_send_welcome_email(user: User):
    await send_welcome_email(user)


async def _bg_send_password_changed_email(user: User):
    await send_password_changed_email(user)


async def _bg_send_password_reset_email(user: User, token: str):
    await send_password_reset_email(user, token)


@router.get("/signup-status")
async def signup_status(service: AuthService = Depends(_service_from_db)):
    return service.signup_status()


@limiter.limit(settings.RATE_LIMIT_LOGIN)
@router.post("/signup", response_model=Message)
async def signup(
    request: Request,
    body: SignupRequest,
    background: BackgroundTasks,
    service: AuthService = Depends(_service_from_db),
):
    del request
    user = service.signup(body)
    background.add_task(_bg_send_welcome_email, user)
    return Message(detail="Signup successful. Please check your email and log in.")


@limiter.limit(settings.RATE_LIMIT_LOGIN)
@router.post("/login", response_model=Token)
async def login(
    request: Request,
    body: LoginRequest,
    service: AuthService = Depends(_service_from_db),
):
    return service.login(body, request_ip=_request_ip(request))


@limiter.limit(settings.RATE_LIMIT_REFRESH)
@router.post("/refresh", response_model=TokenRefresh)
async def refresh(
    request: Request,
    body: RefreshRequest,
    service: AuthService = Depends(_service_from_db),
):
    del request
    return service.refresh_access_token(body)


@router.get("/me", response_model=UserRead)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/logout", response_model=Message)
async def logout(
    request: Request,
    current_user: User = Depends(get_current_user),
    service: AuthService = Depends(_service_from_db),
):
    return service.logout(current_user=current_user, request_ip=_request_ip(request))


@router.post("/change-password", response_model=Message)
async def change_password(
    body: ChangePasswordRequest,
    background: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    service: AuthService = Depends(_service_from_db),
):
    response = service.change_password(current_user=current_user, body=body)
    background.add_task(_bg_send_password_changed_email, current_user)
    return response


@limiter.limit(settings.RATE_LIMIT_LOGIN)
@router.post("/forgot-password", status_code=202, response_model=Message)
async def forgot_password(
    request: Request,
    body: ForgotPasswordRequest,
    background: BackgroundTasks,
    service: AuthService = Depends(_service_from_db),
):
    del request
    email_ready, email_error = get_email_delivery_status()
    if not email_ready:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=email_error or "Password reset is temporarily unavailable.",
        )
    user, token = service.prepare_password_reset(body)
    if user and token:
        background.add_task(_bg_send_password_reset_email, user, token)
    return Message(detail="If the email exists, a reset link was sent")


@limiter.limit(settings.RATE_LIMIT_LOGIN)
@router.post("/reset-password", response_model=Message)
async def reset_password(
    request: Request,
    body: ResetPasswordRequest,
    service: AuthService = Depends(_service_from_db),
):
    del request
    return service.reset_password(body)


__all__ = ["router"]
