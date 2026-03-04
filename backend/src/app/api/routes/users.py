from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from datetime import datetime, timezone

from ...models import User, RoleEnum
from ...schemas import UserCreate, UserRead, UserUpdate, Message
from ..deps import get_current_user, get_db_dep, require_role
from ...core.security import hash_password

router = APIRouter()


@router.get("/", response_model=list[UserRead])
async def list_users(db: Session = Depends(get_db_dep), current: User = Depends(require_role(RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    users = db.scalars(select(User)).all()
    return users


@router.post("/", response_model=UserRead)
async def create_user(body: UserCreate, db: Session = Depends(get_db_dep), current: User = Depends(require_role(RoleEnum.ADMIN))):
    if db.scalar(select(User).where(User.email == body.email)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email exists")
    now = datetime.now(timezone.utc)
    user = User(
        email=body.email,
        name=body.name,
        user_id=body.user_id,
        role=body.role,
        hashed_password=hash_password(body.password),
        created_at=now,
        updated_at=now,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("/{user_id}", response_model=UserRead)
async def get_user(user_id: str, db: Session = Depends(get_db_dep), current: User = Depends(require_role(RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.put("/{user_id}", response_model=UserRead)
async def update_user(user_id: str, body: UserUpdate, db: Session = Depends(get_db_dep), current: User = Depends(require_role(RoleEnum.ADMIN))):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    user.updated_at = datetime.now(timezone.utc)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", response_model=Message)
async def delete_user(user_id: str, db: Session = Depends(get_db_dep), current: User = Depends(require_role(RoleEnum.ADMIN))):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
    return Message(detail="Deleted")
