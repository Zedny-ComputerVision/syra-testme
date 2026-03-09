from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from datetime import datetime, timezone

from ...models import User, RoleEnum, UserPreference
from ...schemas import (
    AdminUserPatch,
    AdminPasswordResetRequest,
    PaginatedResponse,
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
from ...services.audit import write_audit_log

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


def _sort_user_query(query, sort_by: str, sort_dir: str):
    field_map = {
        "name": User.name,
        "email": User.email,
        "role": User.role,
        "created_at": User.created_at,
    }
    column = field_map.get(sort_by, User.created_at)
    if sort_dir == "asc":
        return query.order_by(column.asc(), User.created_at.asc())
    return query.order_by(column.desc(), User.created_at.desc())


def _update_user_record(
    *,
    user: User,
    payload: dict,
    db: Session,
    current: User,
) -> User:
    previous_role = user.role
    changed_fields: list[str] = []
    for field, value in payload.items():
        if getattr(user, field) != value:
            setattr(user, field, value)
            changed_fields.append(field)

    if not changed_fields:
        return user

    user.updated_at = datetime.now(timezone.utc)
    db.add(user)
    db.commit()
    db.refresh(user)

    if "role" in changed_fields and previous_role != user.role:
        write_audit_log(
            db,
            current.id,
            action="USER_ROLE_CHANGED",
            resource_type="User",
            resource_id=str(user.id),
            detail=f"Role changed from {previous_role.value} to {user.role.value}",
        )

    write_audit_log(
        db,
        current.id,
        action="USER_UPDATED",
        resource_type="User",
        resource_id=str(user.id),
        detail=f"Updated fields: {', '.join(changed_fields)}",
    )
    return user


@router.get("/", response_model=PaginatedResponse[UserRead])
async def list_users(
    role: str | None = None,
    search: str | None = None,
    is_active: bool | None = None,
    sort_by: str = Query("created_at"),
    sort_dir: str = Query("desc"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
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
    if search:
        q = search.strip().lower()
        if q:
            like = f"%{q}%"
            query = query.where(
                or_(
                    func.lower(User.name).like(like),
                    func.lower(User.email).like(like),
                    func.lower(User.user_id).like(like),
                )
            )
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    users = db.scalars(
        _sort_user_query(query, sort_by, sort_dir).offset(skip).limit(limit)
    ).all()
    return {
        "items": users,
        "total": total,
        "skip": skip,
        "limit": limit,
    }


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
    return _update_user_record(user=user, payload=payload, db=db, current=current)


@router.patch("/{user_id}", response_model=UserRead)
async def patch_user(
    user_id: str,
    body: AdminUserPatch,
    db: Session = Depends(get_db_dep),
    current: User = Depends(require_permission("Manage Users", RoleEnum.ADMIN)),
):
    user_pk = parse_uuid_param(user_id, detail="User not found")
    user = db.get(User, user_pk)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    payload = body.model_dump(exclude_unset=True)
    if "email" in payload:
        payload["email"] = _clean_required_text(payload.get("email"), "Email")
    if "name" in payload:
        payload["name"] = _clean_required_text(payload.get("name"), "Name")
    if "user_id" in payload:
        payload["user_id"] = _clean_required_text(payload.get("user_id"), "User ID")
    _ensure_unique_email(db, payload.get("email"), existing_user_id=user.id)
    _ensure_unique_user_id(db, payload.get("user_id"), existing_user_id=user.id)
    return _update_user_record(user=user, payload=payload, db=db, current=current)


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
    write_audit_log(
        db,
        current.id,
        action="PASSWORD_RESET",
        resource_type="User",
        resource_id=str(user.id),
        detail="Password reset by administrator",
    )
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
