from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...models import ExamTemplate, RoleEnum
from ...schemas import ExamTemplateCreate, ExamTemplateRead, Message
from ..deps import get_db_dep, require_role

router = APIRouter()


@router.post("/", response_model=ExamTemplateRead)
async def create_template(body: ExamTemplateCreate, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    tpl = ExamTemplate(name=body.name, description=body.description, config=body.config, created_by_id=current.id)
    db.add(tpl)
    db.commit()
    db.refresh(tpl)
    return tpl


@router.get("/", response_model=list[ExamTemplateRead])
async def list_templates(db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    return db.scalars(select(ExamTemplate)).all()


@router.get("/{template_id}", response_model=ExamTemplateRead)
async def get_template(template_id: str, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    tpl = db.get(ExamTemplate, template_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="Not found")
    return tpl


@router.put("/{template_id}", response_model=ExamTemplateRead)
async def update_template(template_id: str, body: ExamTemplateCreate, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    tpl = db.get(ExamTemplate, template_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="Not found")
    if current.role == RoleEnum.INSTRUCTOR and tpl.created_by_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")
    tpl.name = body.name
    tpl.description = body.description
    tpl.config = body.config
    db.add(tpl)
    db.commit()
    db.refresh(tpl)
    return tpl


@router.delete("/{template_id}", response_model=Message)
async def delete_template(template_id: str, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN))):
    tpl = db.get(ExamTemplate, template_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(tpl)
    db.commit()
    return Message(detail="Deleted")
