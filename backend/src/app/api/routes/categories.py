from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ...models import Category, RoleEnum
from ...schemas import CategoryBase, CategoryRead, Message
from ..deps import get_db_dep, parse_uuid_param, require_permission

router = APIRouter()


def _clean_required_text(value: str | None, field_name: str) -> str:
    cleaned = (value or "").strip()
    if not cleaned:
        raise HTTPException(status_code=422, detail=f"{field_name} is required")
    return cleaned


def _clean_optional_text(value: str | None) -> str | None:
    cleaned = (value or "").strip()
    return cleaned or None


def _ensure_unique_category_name(db: Session, name: str, existing_category_id=None):
    existing = db.scalar(
        select(Category).where(func.lower(Category.name) == name.lower())
    )
    if existing and getattr(existing, "id", None) != existing_category_id:
        raise HTTPException(status_code=409, detail="Category exists")


def _normalize_category_payload(body: CategoryBase) -> dict:
    return {
        "name": _clean_required_text(body.name, "Category name"),
        "type": body.type,
        "description": _clean_optional_text(body.description),
    }


@router.post("/", response_model=CategoryRead)
async def create_category(body: CategoryBase, db: Session = Depends(get_db_dep), current=Depends(require_permission("Manage Categories", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    payload = _normalize_category_payload(body)
    _ensure_unique_category_name(db, payload["name"])
    cat = Category(**payload)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.get("/", response_model=list[CategoryRead])
async def list_categories(db: Session = Depends(get_db_dep), current=Depends(require_permission("Manage Categories", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    return db.scalars(select(Category).order_by(Category.name.asc())).all()


@router.get("/{category_id}", response_model=CategoryRead)
async def get_category(category_id: str, db: Session = Depends(get_db_dep), current=Depends(require_permission("Manage Categories", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    category_pk = parse_uuid_param(category_id, detail="Not found")
    cat = db.get(Category, category_pk)
    if not cat:
        raise HTTPException(status_code=404, detail="Not found")
    return cat


@router.put("/{category_id}", response_model=CategoryRead)
async def update_category(category_id: str, body: CategoryBase, db: Session = Depends(get_db_dep), current=Depends(require_permission("Manage Categories", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    category_pk = parse_uuid_param(category_id, detail="Not found")
    cat = db.get(Category, category_pk)
    if not cat:
        raise HTTPException(status_code=404, detail="Not found")
    payload = _normalize_category_payload(body)
    _ensure_unique_category_name(db, payload["name"], existing_category_id=cat.id)
    for field, value in payload.items():
        setattr(cat, field, value)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/{category_id}", response_model=Message)
async def delete_category(category_id: str, db: Session = Depends(get_db_dep), current=Depends(require_permission("Manage Categories", RoleEnum.ADMIN))):
    category_pk = parse_uuid_param(category_id, detail="Not found")
    cat = db.get(Category, category_pk)
    if not cat:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(cat)
    db.commit()
    return Message(detail="Deleted")
