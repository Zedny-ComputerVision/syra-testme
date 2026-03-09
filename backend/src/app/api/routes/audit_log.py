from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ...models import AuditLog, RoleEnum
from ...schemas import AuditLogRead, PaginatedResponse
from ..deps import get_db_dep, require_permission

router = APIRouter()


@router.get("/", response_model=PaginatedResponse[AuditLogRead])
async def list_audit_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
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
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    logs = db.scalars(
        query.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit)
    ).all()
    return {
        "items": logs,
        "total": total,
        "skip": skip,
        "limit": limit,
    }
