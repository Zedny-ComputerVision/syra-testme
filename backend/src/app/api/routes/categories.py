from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...models import Category, RoleEnum
from ...schemas import CategoryBase, CategoryRead, Message
from ..deps import get_current_user, get_db_dep, require_role

router = APIRouter()


@router.post("/", response_model=CategoryRead)
async def create_category(body: CategoryBase, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    if db.scalar(select(Category).where(Category.name == body.name)):
        raise HTTPException(status_code=409, detail="Category exists")
    cat = Category(**body.model_dump())
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.get("/", response_model=list[CategoryRead])
async def list_categories(db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    return db.scalars(select(Category)).all()


@router.get("/{category_id}", response_model=CategoryRead)
async def get_category(category_id: str, db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    cat = db.get(Category, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Not found")
    return cat


@router.put("/{category_id}", response_model=CategoryRead)
async def update_category(category_id: str, body: CategoryBase, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    cat = db.get(Category, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Not found")
    for field, value in body.model_dump().items():
        setattr(cat, field, value)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/{category_id}", response_model=Message)
async def delete_category(category_id: str, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN))):
    cat = db.get(Category, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(cat)
    db.commit()
    return Message(detail="Deleted")
