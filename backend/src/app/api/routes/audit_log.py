from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...models import AuditLog, RoleEnum
from ...schemas import AuditLogRead
from ..deps import get_db_dep, require_role

router = APIRouter()


@router.get("/", response_model=list[AuditLogRead])
async def list_audit_logs(
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db_dep),
    current=Depends(require_role(RoleEnum.ADMIN)),
):
    query = select(AuditLog).order_by(AuditLog.created_at.desc()).offset(offset).limit(limit)
    return db.scalars(query).all()
