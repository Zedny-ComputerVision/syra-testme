from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...models import User, UserGroup, RoleEnum
from ...schemas import UserGroupCreate, UserGroupRead, UserRead, Message
from ...services.normalized_relations import replace_user_group_members, serialize_user_group_member_ids
from ..deps import get_db_dep, parse_uuid_param, require_permission

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


def _get_group_or_404(db: Session, group_id: str) -> UserGroup:
    group_pk = parse_uuid_param(group_id, detail="Not found")
    group = db.get(UserGroup, group_pk)
    if not group:
        raise HTTPException(status_code=404, detail="Not found")
    return group


def _ensure_unique_group_name(db: Session, name: str, existing_group_id=None):
    from sqlalchemy import func
    normalized = name.strip().lower()
    existing = db.scalar(
        select(UserGroup).where(func.lower(UserGroup.name) == normalized)
    )
    if existing and getattr(existing, "id", None) != existing_group_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Group name exists")


def _normalize_member_ids(db: Session, raw_member_ids: list[str] | None) -> list:
    member_ids = []
    for raw_member_id in raw_member_ids or []:
        user_pk = parse_uuid_param(str(raw_member_id), detail="User not found")
        user = db.get(User, user_pk)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        if user.role != RoleEnum.LEARNER:
            raise HTTPException(
                status_code=422,
                detail="Only learners can be added to groups",
            )
        normalized_user_id = str(user.id)
        if normalized_user_id not in member_ids:
            member_ids.append(normalized_user_id)
    return member_ids


def _normalize_group_payload(db: Session, body: UserGroupCreate) -> dict:
    return {
        "name": _clean_required_text(body.name, "Group name"),
        "description": _clean_optional_text(body.description),
        "member_ids": _normalize_member_ids(db, body.member_ids),
    }


def _build_group_read(group: UserGroup) -> UserGroupRead:
    return UserGroupRead(
        id=group.id,
        name=group.name,
        description=group.description,
        member_ids=serialize_user_group_member_ids(group),
        created_at=group.created_at,
        updated_at=group.updated_at,
    )


@router.post("/", response_model=UserGroupRead)
def create_group(body: UserGroupCreate, db: Session = Depends(get_db_dep), current=Depends(require_permission("Manage Users", RoleEnum.ADMIN))):
    payload = _normalize_group_payload(db, body)
    _ensure_unique_group_name(db, payload["name"])
    member_ids = payload.pop("member_ids", [])
    group = UserGroup(**payload)
    replace_user_group_members(group, member_ids)
    db.add(group)
    db.commit()
    db.refresh(group)
    return _build_group_read(group)


@router.get("/", response_model=list[UserGroupRead])
def list_groups(db: Session = Depends(get_db_dep), current=Depends(require_permission("Manage Users", RoleEnum.ADMIN))):
    groups = db.scalars(select(UserGroup).order_by(UserGroup.created_at.desc())).all()
    return [_build_group_read(group) for group in groups]


@router.get("/{group_id}", response_model=UserGroupRead)
def get_group(group_id: str, db: Session = Depends(get_db_dep), current=Depends(require_permission("Manage Users", RoleEnum.ADMIN))):
    return _build_group_read(_get_group_or_404(db, group_id))


@router.put("/{group_id}", response_model=UserGroupRead)
def update_group(group_id: str, body: UserGroupCreate, db: Session = Depends(get_db_dep), current=Depends(require_permission("Manage Users", RoleEnum.ADMIN))):
    group = _get_group_or_404(db, group_id)
    payload = _normalize_group_payload(db, body)
    _ensure_unique_group_name(db, payload["name"], existing_group_id=group.id)
    group.name = payload["name"]
    group.description = payload["description"]
    replace_user_group_members(group, payload["member_ids"])
    db.add(group)
    db.commit()
    db.refresh(group)
    return _build_group_read(group)


@router.delete("/{group_id}", response_model=Message)
def delete_group(group_id: str, db: Session = Depends(get_db_dep), current=Depends(require_permission("Manage Users", RoleEnum.ADMIN))):
    group = _get_group_or_404(db, group_id)
    db.delete(group)
    db.commit()
    return Message(detail="Deleted")


@router.get("/{group_id}/members", response_model=list[UserRead])
def list_group_members(
    group_id: str,
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("Manage Users", RoleEnum.ADMIN)),
):
    group = _get_group_or_404(db, group_id)
    member_ids = serialize_user_group_member_ids(group)
    if not member_ids:
        return []
    user_ids = [parse_uuid_param(member_id, detail="User not found") for member_id in member_ids]
    users = db.scalars(select(User).where(User.id.in_(user_ids))).all()
    user_map = {str(user.id): user for user in users}
    return [user_map[member_id] for member_id in member_ids if member_id in user_map]


@router.post("/{group_id}/members", response_model=Message)
def add_group_member(
    group_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("Manage Users", RoleEnum.ADMIN)),
):
    group = _get_group_or_404(db, group_id)
    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=422, detail="user_id is required")
    user_pk = parse_uuid_param(user_id, detail="User not found")
    user = db.get(User, user_pk)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role != RoleEnum.LEARNER:
        raise HTTPException(
            status_code=422,
            detail="Only learners can be added to groups",
        )
    member_ids = serialize_user_group_member_ids(group)
    normalized_user_id = str(user.id)
    if normalized_user_id in member_ids:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already in group")
    member_ids.append(normalized_user_id)
    replace_user_group_members(group, member_ids)
    db.add(group)
    db.commit()
    return Message(detail="Member added")


@router.post("/{group_id}/members/bulk", response_model=Message)
def add_group_members_bulk(
    group_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("Manage Users", RoleEnum.ADMIN)),
):
    group = _get_group_or_404(db, group_id)
    user_ids = payload.get("user_ids")
    if not user_ids or not isinstance(user_ids, list):
        raise HTTPException(status_code=422, detail="user_ids list is required")
    member_ids = serialize_user_group_member_ids(group)
    added = 0
    for raw_id in user_ids:
        user_pk = parse_uuid_param(str(raw_id), detail="User not found")
        user = db.get(User, user_pk)
        if not user:
            continue
        if user.role != RoleEnum.LEARNER:
            continue
        normalized_user_id = str(user.id)
        if normalized_user_id not in member_ids:
            member_ids.append(normalized_user_id)
            added += 1
    replace_user_group_members(group, member_ids)
    db.add(group)
    db.commit()
    return Message(detail=f"{added} member{'s' if added != 1 else ''} added")


@router.delete("/{group_id}/members/{user_id}", response_model=Message)
def remove_group_member(
    group_id: str,
    user_id: str,
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("Manage Users", RoleEnum.ADMIN)),
):
    group = _get_group_or_404(db, group_id)
    user_pk = parse_uuid_param(user_id, detail="User not found")
    member_ids = serialize_user_group_member_ids(group)
    normalized_user_id = str(user_pk)
    if normalized_user_id not in member_ids:
        raise HTTPException(status_code=404, detail="Member not found")
    replace_user_group_members(group, [member_id for member_id in member_ids if member_id != normalized_user_id])
    db.add(group)
    db.commit()
    return Message(detail="Member removed")
