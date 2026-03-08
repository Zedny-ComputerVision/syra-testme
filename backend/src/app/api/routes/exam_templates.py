from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...models import ExamTemplate, RoleEnum
from ...schemas import ExamTemplateCreate, ExamTemplateRead, Message
from ..deps import get_db_dep, parse_uuid_param, require_permission

router = APIRouter()


def _clean_required_text(value: str | None, field_name: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise HTTPException(status_code=422, detail=f"{field_name} is required")
    return text


def _clean_optional_text(value: str | None) -> str | None:
    text = str(value or "").strip()
    return text or None


def _ensure_unique_template_name(db: Session, name: str, existing_template_id=None):
    templates = db.scalars(select(ExamTemplate)).all()
    normalized = name.strip().lower()
    for template in templates:
        if template.id == existing_template_id:
            continue
        if str(template.name or "").strip().lower() == normalized:
            raise HTTPException(status_code=409, detail="Template name exists")


def _normalize_template_payload(body: ExamTemplateCreate) -> dict:
    return {
        "name": _clean_required_text(body.name, "Template name"),
        "description": _clean_optional_text(body.description),
        "config": body.config or {},
    }


@router.post("/", response_model=ExamTemplateRead)
async def create_template(body: ExamTemplateCreate, db: Session = Depends(get_db_dep), current=Depends(require_permission("Edit Tests", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    payload = _normalize_template_payload(body)
    _ensure_unique_template_name(db, payload["name"])
    tpl = ExamTemplate(created_by_id=current.id, **payload)
    db.add(tpl)
    db.commit()
    db.refresh(tpl)
    return tpl


@router.get("/", response_model=list[ExamTemplateRead])
async def list_templates(db: Session = Depends(get_db_dep), current=Depends(require_permission("Edit Tests", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    return db.scalars(select(ExamTemplate).order_by(ExamTemplate.created_at.desc())).all()


@router.get("/{template_id}", response_model=ExamTemplateRead)
async def get_template(template_id: str, db: Session = Depends(get_db_dep), current=Depends(require_permission("Edit Tests", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    template_pk = parse_uuid_param(template_id, detail="Not found")
    tpl = db.get(ExamTemplate, template_pk)
    if not tpl:
        raise HTTPException(status_code=404, detail="Not found")
    return tpl


@router.put("/{template_id}", response_model=ExamTemplateRead)
async def update_template(template_id: str, body: ExamTemplateCreate, db: Session = Depends(get_db_dep), current=Depends(require_permission("Edit Tests", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    template_pk = parse_uuid_param(template_id, detail="Not found")
    tpl = db.get(ExamTemplate, template_pk)
    if not tpl:
        raise HTTPException(status_code=404, detail="Not found")
    if current.role == RoleEnum.INSTRUCTOR and tpl.created_by_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")
    payload = _normalize_template_payload(body)
    _ensure_unique_template_name(db, payload["name"], existing_template_id=tpl.id)
    tpl.name = payload["name"]
    tpl.description = payload["description"]
    tpl.config = payload["config"]
    db.add(tpl)
    db.commit()
    db.refresh(tpl)
    return tpl


@router.delete("/{template_id}", response_model=Message)
async def delete_template(template_id: str, db: Session = Depends(get_db_dep), current=Depends(require_permission("Edit Tests", RoleEnum.ADMIN))):
    template_pk = parse_uuid_param(template_id, detail="Not found")
    tpl = db.get(ExamTemplate, template_pk)
    if not tpl:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(tpl)
    db.commit()
    return Message(detail="Deleted")
