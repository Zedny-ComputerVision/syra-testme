from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..models import AuditLog
from ..utils.pagination import build_page_response, clamp_sort_field, normalize_pagination


def list_audit_logs(
    *,
    db: Session,
    page: int | None,
    page_size: int | None,
    search: str | None,
    sort: str | None,
    order: str | None,
    skip: int | None,
    limit: int | None,
    q: str | None,
    action: str | None,
    from_date: datetime | None,
    to_date: datetime | None,
    user_id: str | None,
):
    pagination = normalize_pagination(
        page=page,
        page_size=page_size,
        search=search or q,
        sort=sort,
        order=order,
        skip=skip,
        limit=limit,
        default_sort="created_at",
        default_page_size=50,
    )
    resolved_sort = clamp_sort_field(pagination.sort, {"created_at", "action", "resource_id"}, "created_at")
    order_column = getattr(AuditLog, resolved_sort)
    order_column = order_column.asc() if pagination.order == "asc" else order_column.desc()

    query = select(AuditLog)
    if pagination.search:
        query = query.where(
            or_(
                AuditLog.action.ilike(f"%{pagination.search}%"),
                AuditLog.resource_id.ilike(f"%{pagination.search}%"),
            )
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
        query.order_by(order_column, AuditLog.created_at.desc()).offset(pagination.offset).limit(pagination.limit)
    ).all()
    return build_page_response(items=logs, total=total, pagination=pagination, extended=False)
