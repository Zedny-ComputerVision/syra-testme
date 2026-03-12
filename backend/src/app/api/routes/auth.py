from fastapi import APIRouter

from ...modules.auth import routes_public as public_routes
from ...modules.auth.routes_admin import router as admin_router
from ...modules.auth.routes_public import router as public_router
from ...modules.auth.schemas import SignupRequest
from ...services.email import (
    get_email_delivery_status as _get_email_delivery_status,
    send_admin_setup_email as _send_admin_setup_email,
    send_password_changed_email as _send_password_changed_email,
    send_password_reset_email as _send_password_reset_email,
    send_welcome_email as _send_welcome_email,
)


def get_email_delivery_status():
    return _get_email_delivery_status()


async def send_welcome_email(*args, **kwargs):
    return await _send_welcome_email(*args, **kwargs)


async def send_password_reset_email(*args, **kwargs):
    return await _send_password_reset_email(*args, **kwargs)


async def send_admin_setup_email(*args, **kwargs):
    return await _send_admin_setup_email(*args, **kwargs)


async def send_password_changed_email(*args, **kwargs):
    return await _send_password_changed_email(*args, **kwargs)


public_routes.get_email_delivery_status = lambda: get_email_delivery_status()
public_routes.send_welcome_email = lambda *args, **kwargs: send_welcome_email(*args, **kwargs)
public_routes.send_password_reset_email = lambda *args, **kwargs: send_password_reset_email(*args, **kwargs)
public_routes.send_admin_setup_email = lambda *args, **kwargs: send_admin_setup_email(*args, **kwargs)
public_routes.send_password_changed_email = lambda *args, **kwargs: send_password_changed_email(*args, **kwargs)


router = APIRouter()
router.include_router(admin_router)
router.include_router(public_router)


__all__ = [
    "router",
    "SignupRequest",
    "send_welcome_email",
    "send_password_reset_email",
    "send_admin_setup_email",
    "send_password_changed_email",
    "get_email_delivery_status",
]
