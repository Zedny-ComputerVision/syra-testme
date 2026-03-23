from __future__ import annotations

import asyncio

from fastapi import APIRouter, BackgroundTasks, Depends

from ...api.deps import get_db_dep
from ...models import User
from ...services.email import send_admin_setup_email
from .repository import AuthRepository
from .schemas import UserCreate, UserRead
from .service import AuthService


router = APIRouter()


def _service_from_db(db=Depends(get_db_dep)) -> AuthService:
    return AuthService(AuthRepository(db))


async def _bg_send_admin_setup_email(user: User):
    await send_admin_setup_email(user)


@router.post("/setup", response_model=UserRead)
async def setup_admin(
    body: UserCreate,
    background: BackgroundTasks,
    service: AuthService = Depends(_service_from_db),
):
    user = service.setup_admin(body)
    background.add_task(_bg_send_admin_setup_email, user)
    return user


__all__ = ["router"]
