from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ...models import AuditLog, RoleEnum
from ...schemas import AuditLogRead
from ..deps import get_db_dep, require_permission

router = APIRouter()


@router.get("/", response_model=list[AuditLogRead])
async def list_audit_logs(
    limit: int = 200,
    offset: int = 0,
    q: Optional[str] = Query(None, description="Search in action or resource_id"),
    action: Optional[str] = Query(None, description="Filter by action name"),
    from_date: Optional[datetime] = Query(None, description="Filter logs after this date"),
    to_date: Optional[datetime] = Query(None, description="Filter logs before this date"),
    user_id: Optional[str] = Query(None, description="Filter by user_id"),
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("View Audit Log", RoleEnum.ADMIN)),
):
    query = select(AuditLog)
    if q:
        query = query.where(
            or_(AuditLog.action.ilike(f"%{q}%"), AuditLog.resource_id.ilike(f"%{q}%"))
        )
    if action:
        query = query.where(AuditLog.action.ilike(f"%{action}%"))
    if from_date:
        query = query.where(AuditLog.created_at >= from_date)
    if to_date:
        query = query.where(AuditLog.created_at <= to_date)
    if user_id:
        query = query.where(AuditLog.user_id == user_id)
    query = query.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit)
    return db.scalars(query).all()
