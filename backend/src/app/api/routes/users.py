from fastapi import APIRouter

from ...api.deps import load_permission_rows as _load_permission_rows
from ...modules.users import service as _service_impl
from ...modules.users.repository import UserRepository
from ...modules.users.routes_admin import router as admin_router
from ...modules.users.routes_public import router as public_router
from ...modules.users.schemas import (
    UserPreferenceRead,
    UserPreferenceUpdate,
    UserRead,
    UserUpdate,
)
from ...modules.users.service import UserService


def load_permission_rows(db):
    return _load_permission_rows(db)


def _load_permission_rows_proxy(db):
    return load_permission_rows(db)


_service_impl.load_permission_rows = _load_permission_rows_proxy


def _service_from_db(db) -> UserService:
    return UserService(UserRepository(db))


router = APIRouter()
router.include_router(public_router)
router.include_router(admin_router)


def list_learners_for_scheduling(
    search: str | None = None,
    is_active: bool | None = True,
    db=None,
    current=None,
):
    return _service_from_db(db).list_learners_for_scheduling(
        current=current,
        search=search,
        is_active=is_active,
    )


def get_my_preference(
    key: str,
    db=None,
    current=None,
):
    return _service_from_db(db).get_my_preference(key=key, current=current)


def update_my_preference(
    key: str,
    body: UserPreferenceUpdate,
    db=None,
    current=None,
):
    return _service_from_db(db).update_my_preference(key=key, body=body, current=current)


def update_user(
    user_id: str,
    body: UserUpdate,
    db=None,
    current=None,
):
    return _service_from_db(db).update_user(user_id=user_id, body=body, current=current)


__all__ = [
    "router",
    "UserPreferenceRead",
    "UserPreferenceUpdate",
    "UserRead",
    "UserUpdate",
    "load_permission_rows",
    "list_learners_for_scheduling",
    "get_my_preference",
    "update_my_preference",
    "update_user",
]
