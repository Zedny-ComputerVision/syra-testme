from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from datetime import datetime, timezone

from ...models import User, RoleEnum, UserPreference
from ...schemas import (
    AdminPasswordResetRequest,
    UserCreate,
    UserPreferenceRead,
    UserPreferenceUpdate,
    UserRead,
    UserSelfUpdate,
    UserUpdate,
    Message,
)
from ..deps import (
    get_current_user,
    get_db_dep,
    load_permission_rows,
    parse_uuid_param,
    permission_allowed,
    require_permission,
)
from ...core.security import hash_password

router = APIRouter()


def _clean_required_text(value: str | None, field_name: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise HTTPException(
            status_code=422,
            detail=f"{field_name} is required",
        )
    return text


def _clean_optional_text(value: str | None) -> str | None:
    text = str(value or "").strip()
    return text or None


def _ensure_unique_email(db: Session, email: str | None, existing_user_id=None):
    if not email:
        return
    existing = db.scalar(select(User).where(User.email == email))
    if existing and existing.id != existing_user_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email exists")


def _ensure_unique_user_id(db: Session, user_id: str | None, existing_user_id=None):
    if not user_id:
        return
    existing = db.scalar(select(User).where(User.user_id == user_id))
    if existing and existing.id != existing_user_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User ID exists")


def _normalize_user_payload(payload: dict, *, partial: bool) -> dict:
    cleaned: dict = {}
    if not partial or "email" in payload:
        cleaned["email"] = _clean_required_text(payload.get("email"), "Email")
    if not partial or "name" in payload:
        cleaned["name"] = _clean_required_text(payload.get("name"), "Name")
    if not partial or "user_id" in payload:
        cleaned["user_id"] = _clean_required_text(payload.get("user_id"), "User ID")
    if "role" in payload:
        cleaned["role"] = payload["role"]
    if "is_active" in payload:
        cleaned["is_active"] = payload["is_active"]
    return cleaned


@router.get("/", response_model=list[UserRead])
async def list_users(
    role: str | None = None,
    search: str | None = None,
    is_active: bool | None = None,
    db: Session = Depends(get_db_dep),
    current: User = Depends(require_permission("Manage Users", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR)),
):
    query = select(User)
    if role:
        try:
            query = query.where(User.role == RoleEnum(role))
        except ValueError:
            pass
    if is_active is not None:
        query = query.where(User.is_active == is_active)
    users = db.scalars(query.order_by(User.created_at.desc())).all()
    if search:
        q = search.strip().lower()
        users = [u for u in users if q in (u.name or "").lower() or q in (u.email or "").lower() or q in (u.user_id or "").lower()]
    return users


@router.get("/learners", response_model=list[UserRead])
async def list_learners_for_scheduling(
    search: str | None = None,
    is_active: bool | None = True,
    db: Session = Depends(get_db_dep),
    current: User = Depends(get_current_user),
):
    rows = load_permission_rows(db)
    can_schedule = permission_allowed(rows, current.role, "Assign Schedules")
    can_manage_users = permission_allowed(rows, current.role, "Manage Users")
    if current.role not in {RoleEnum.ADMIN, RoleEnum.INSTRUCTOR} or not (can_schedule or can_manage_users):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    query = select(User).where(User.role == RoleEnum.LEARNER)
    if is_active is not None:
        query = query.where(User.is_active == is_active)
    learners = db.scalars(query.order_by(User.created_at.desc())).all()
    if search:
        q = search.strip().lower()
        learners = [
            learner
            for learner in learners
            if q in (learner.name or "").lower()
            or q in (learner.email or "").lower()
            or q in (learner.user_id or "").lower()
        ]
    return learners


@router.post("/", response_model=UserRead)
async def create_user(body: UserCreate, db: Session = Depends(get_db_dep), current: User = Depends(require_permission("Manage Users", RoleEnum.ADMIN))):
    payload = _normalize_user_payload(body.model_dump(exclude={"password"}), partial=False)
    _ensure_unique_email(db, payload["email"])
    _ensure_unique_user_id(db, payload["user_id"])
    now = datetime.now(timezone.utc)
    user = User(
        email=payload["email"],
        name=payload["name"],
        user_id=payload["user_id"],
        role=payload["role"],
        is_active=payload["is_active"],
        hashed_password=hash_password(body.password),
        created_at=now,
        updated_at=now,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("/{user_id}", response_model=UserRead)
async def get_user(user_id: str, db: Session = Depends(get_db_dep), current: User = Depends(require_permission("Manage Users", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    user_pk = parse_uuid_param(user_id, detail="User not found")
    user = db.get(User, user_pk)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.put("/{user_id}", response_model=UserRead)
async def update_user(user_id: str, body: UserUpdate, db: Session = Depends(get_db_dep), current: User = Depends(require_permission("Manage Users", RoleEnum.ADMIN))):
    user_pk = parse_uuid_param(user_id, detail="User not found")
    user = db.get(User, user_pk)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    payload = _normalize_user_payload(body.model_dump(exclude_unset=True), partial=True)
    _ensure_unique_email(db, payload.get("email"), existing_user_id=user.id)
    _ensure_unique_user_id(db, payload.get("user_id"), existing_user_id=user.id)
    for field, value in payload.items():
        setattr(user, field, value)
    user.updated_at = datetime.now(timezone.utc)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/me", response_model=UserRead)
async def update_me(
    body: UserSelfUpdate,
    db: Session = Depends(get_db_dep),
    current: User = Depends(get_current_user),
):
    payload = body.model_dump(exclude_unset=True)
    cleaned: dict = {}
    if "email" in payload:
        cleaned["email"] = _clean_required_text(payload.get("email"), "Email")
    if "name" in payload:
        cleaned["name"] = _clean_required_text(payload.get("name"), "Name")
    payload = cleaned
    if "email" in payload:
        _ensure_unique_email(db, payload.get("email"), existing_user_id=current.id)
    for field, value in payload.items():
        setattr(current, field, value)
    current.updated_at = datetime.now(timezone.utc)
    db.add(current)
    db.commit()
    db.refresh(current)
    return current


@router.get("/me/preferences/{key}", response_model=UserPreferenceRead)
async def get_my_preference(
    key: str,
    db: Session = Depends(get_db_dep),
    current: User = Depends(get_current_user),
):
    pref = db.scalar(
        select(UserPreference).where(
            UserPreference.user_id == current.id,
            UserPreference.key == key,
        )
    )
    if not pref:
        return UserPreferenceRead(key=key, value=None, updated_at=None)
    return pref


@router.put("/me/preferences/{key}", response_model=UserPreferenceRead)
async def update_my_preference(
    key: str,
    body: UserPreferenceUpdate,
    db: Session = Depends(get_db_dep),
    current: User = Depends(get_current_user),
):
    pref = db.scalar(
        select(UserPreference).where(
            UserPreference.user_id == current.id,
            UserPreference.key == key,
        )
    )
    if not pref:
        pref = UserPreference(user_id=current.id, key=key, value=body.value)
    else:
        pref.value = body.value
    pref.updated_at = datetime.now(timezone.utc)
    db.add(pref)
    db.commit()
    db.refresh(pref)
    return pref


@router.post("/{user_id}/reset-password", response_model=Message)
async def reset_user_password(
    user_id: str,
    body: AdminPasswordResetRequest,
    db: Session = Depends(get_db_dep),
    current: User = Depends(require_permission("Manage Users", RoleEnum.ADMIN)),
):
    user_pk = parse_uuid_param(user_id, detail="User not found")
    user = db.get(User, user_pk)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not body.new_password or len(body.new_password) < 8:
        raise HTTPException(
            status_code=422,
            detail="Password must be at least 8 characters",
        )
    user.hashed_password = hash_password(body.new_password)
    user.updated_at = datetime.now(timezone.utc)
    db.add(user)
    db.commit()
    return Message(detail="Password reset")


@router.delete("/{user_id}", response_model=Message)
async def delete_user(user_id: str, db: Session = Depends(get_db_dep), current: User = Depends(require_permission("Manage Users", RoleEnum.ADMIN))):
    user_pk = parse_uuid_param(user_id, detail="User not found")
    user = db.get(User, user_pk)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    db.delete(user)
    db.commit()
    return Message(detail="Deleted")
