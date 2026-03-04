from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...models import UserGroup, RoleEnum
from ...schemas import UserGroupCreate, UserGroupRead, Message
from ..deps import get_db_dep, require_role

router = APIRouter()


@router.post("/", response_model=UserGroupRead)
async def create_group(body: UserGroupCreate, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN))):
    if db.scalar(select(UserGroup).where(UserGroup.name == body.name)):
        raise HTTPException(status_code=409, detail="Group name exists")
    group = UserGroup(name=body.name, description=body.description, member_ids=body.member_ids)
    db.add(group)
    db.commit()
    db.refresh(group)
    return group


@router.get("/", response_model=list[UserGroupRead])
async def list_groups(db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    return db.scalars(select(UserGroup)).all()


@router.get("/{group_id}", response_model=UserGroupRead)
async def get_group(group_id: str, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    group = db.get(UserGroup, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Not found")
    return group


@router.put("/{group_id}", response_model=UserGroupRead)
async def update_group(group_id: str, body: UserGroupCreate, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN))):
    group = db.get(UserGroup, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Not found")
    group.name = body.name
    group.description = body.description
    group.member_ids = body.member_ids
    db.add(group)
    db.commit()
    db.refresh(group)
    return group


@router.delete("/{group_id}", response_model=Message)
async def delete_group(group_id: str, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN))):
    group = db.get(UserGroup, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(group)
    db.commit()
    return Message(detail="Deleted")
