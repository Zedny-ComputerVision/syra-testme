from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...models import GradingScale, RoleEnum
from ...schemas import GradingScaleBase, GradingScaleRead, Message
from ..deps import get_current_user, get_db_dep, require_role

router = APIRouter()


@router.post("/", response_model=GradingScaleRead)
async def create_scale(body: GradingScaleBase, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    scale = GradingScale(**body.model_dump())
    db.add(scale)
    db.commit()
    db.refresh(scale)
    return scale


@router.get("/", response_model=list[GradingScaleRead])
async def list_scales(db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    return db.scalars(select(GradingScale)).all()


@router.get("/{scale_id}", response_model=GradingScaleRead)
async def get_scale(scale_id: str, db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    scale = db.get(GradingScale, scale_id)
    if not scale:
        raise HTTPException(status_code=404, detail="Not found")
    return scale


@router.put("/{scale_id}", response_model=GradingScaleRead)
async def update_scale(scale_id: str, body: GradingScaleBase, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    scale = db.get(GradingScale, scale_id)
    if not scale:
        raise HTTPException(status_code=404, detail="Not found")
    scale.name = body.name
    scale.labels = body.labels
    db.add(scale)
    db.commit()
    db.refresh(scale)
    return scale


@router.delete("/{scale_id}", response_model=Message)
async def delete_scale(scale_id: str, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN))):
    scale = db.get(GradingScale, scale_id)
    if not scale:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(scale)
    db.commit()
    return Message(detail="Deleted")
