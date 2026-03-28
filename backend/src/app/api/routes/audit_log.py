from datetime import datetime

from fastapi import APIRouter, Depends, Query

from ...models import RoleEnum
from ...schemas import AuditLogRead, PaginatedResponse
from ...services.audit_log_service import list_audit_logs as list_audit_logs_service
from ...utils.pagination import MAX_PAGE_SIZE
from ..deps import get_db_dep, require_permission

router = APIRouter()


@router.get("/", response_model=PaginatedResponse[AuditLogRead])
def list_audit_logs(
    page: int | None = Query(None, ge=1),
    page_size: int | None = Query(None, ge=1, le=MAX_PAGE_SIZE),
    search: str | None = Query(None, description="Search in action or resource_id"),
    sort: str | None = Query(None),
    order: str | None = Query(None),
    skip: int | None = Query(None, ge=0),
    limit: int | None = Query(None, ge=1, le=MAX_PAGE_SIZE),
    q: str | None = Query(None, description="Legacy alias for search in action or resource_id"),
    action: str | None = Query(None, description="Filter by action name"),
    from_date: datetime | None = Query(None, description="Filter logs after this date"),
    to_date: datetime | None = Query(None, description="Filter logs before this date"),
    user_id: str | None = Query(None, description="Filter by user_id"),
    db=Depends(get_db_dep),
    current=Depends(require_permission("View Audit Log", RoleEnum.ADMIN)),
):
    del current
    return list_audit_logs_service(
        db=db,
        page=page,
        page_size=page_size,
        search=search,
        sort=sort,
        order=order,
        skip=skip,
        limit=limit,
        q=q,
        action=action,
        from_date=from_date,
        to_date=to_date,
        user_id=user_id,
    )
