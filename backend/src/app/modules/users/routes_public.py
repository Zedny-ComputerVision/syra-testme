from __future__ import annotations

from fastapi import APIRouter, Depends

from ...api.deps import get_current_user, get_db_dep
from ...models import User
from .repository import UserRepository
from .schemas import UserPreferenceRead, UserPreferenceUpdate, UserRead, UserSelfUpdate
from .service import UserService


router = APIRouter()


def _service_from_db(db=Depends(get_db_dep)) -> UserService:
    return UserService(UserRepository(db))


@router.get("/learners", response_model=list[UserRead])
def list_learners_for_scheduling(
    search: str | None = None,
    is_active: bool | None = True,
    current: User = Depends(get_current_user),
    service: UserService = Depends(_service_from_db),
):
    return service.list_learners_for_scheduling(current=current, search=search, is_active=is_active)


@router.patch("/me", response_model=UserRead)
def update_me(
    body: UserSelfUpdate,
    current: User = Depends(get_current_user),
    service: UserService = Depends(_service_from_db),
):
    return service.update_me(body=body, current=current)


@router.get("/me/preferences/{key}", response_model=UserPreferenceRead)
def get_my_preference(
    key: str,
    current: User = Depends(get_current_user),
    service: UserService = Depends(_service_from_db),
):
    return service.get_my_preference(key=key, current=current)


@router.put("/me/preferences/{key}", response_model=UserPreferenceRead)
def update_my_preference(
    key: str,
    body: UserPreferenceUpdate,
    current: User = Depends(get_current_user),
    service: UserService = Depends(_service_from_db),
):
    return service.update_my_preference(key=key, body=body, current=current)


__all__ = ["router"]
