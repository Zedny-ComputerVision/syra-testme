from __future__ import annotations

from datetime import datetime
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import HTMLResponse, JSONResponse

from ...api.deps import get_db_dep, require_permission
from ...models import RoleEnum
from ...utils.request_ip import get_request_ip
from ...utils.pagination import MAX_PAGE_SIZE, normalize_pagination
from .enums import TestStatus, TestType
from .repository import TestRepository
from .schemas import (
    TestCreateDTO,
    TestListResponseDTO,
    TestResponseDTO,
    TestUpdateDTO,
)
from .service import ServiceActor, TestService, TestServiceError

router = APIRouter(prefix="/admin/tests", tags=["tests"])


def _service_from_db(db=Depends(get_db_dep)) -> TestService:
    return TestService(TestRepository(db))


def _json_error(exc: TestServiceError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content=exc.to_response())


def _request_ip(request: Request | None) -> str | None:
    return get_request_ip(request)


def _actor_from_current(current) -> ServiceActor:
    actor_id = getattr(current, "id", None)
    if actor_id and not isinstance(actor_id, uuid.UUID):
        actor_id = uuid.UUID(str(actor_id))
    return ServiceActor(id=actor_id, role=getattr(current, "role", None))


@router.get("/", response_model=TestListResponseDTO)
async def list_tests(
    search: str | None = None,
    status: str | None = None,
    type: TestType | None = None,
    category_id: uuid.UUID | None = None,
    created_from: datetime | None = None,
    created_to: datetime | None = None,
    sort: str | None = None,
    order: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=MAX_PAGE_SIZE),
    current=Depends(require_permission("Edit Tests", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR)),
    service: TestService = Depends(_service_from_db),
):
    try:
        pagination = normalize_pagination(
            page=page,
            page_size=page_size,
            search=search,
            sort=sort,
            order=order,
            default_sort="created_at",
        )
        status_filter = None
        if status:
            parsed = []
            for raw in status.split(","):
                value = raw.strip()
                if not value:
                    continue
                try:
                    parsed.append(TestStatus(value))
                except ValueError:
                    continue
            status_filter = tuple(parsed) if parsed else None
        return service.list_tests(
            actor=_actor_from_current(current),
            pagination=pagination,
            status=status_filter,
            test_type=type,
            category_id=category_id,
            created_from=created_from,
            created_to=created_to,
        )
    except TestServiceError as exc:
        return _json_error(exc)


@router.post("/", response_model=TestResponseDTO, status_code=201)
async def create_test(
    body: TestCreateDTO,
    request: Request,
    current=Depends(require_permission("Create Tests", RoleEnum.ADMIN)),
    service: TestService = Depends(_service_from_db),
):
    try:
        return service.create_test(body=body, actor=_actor_from_current(current), request_ip=_request_ip(request))
    except TestServiceError as exc:
        return _json_error(exc)


@router.get("/{test_id}", response_model=TestResponseDTO)
async def get_test(
    test_id: str,
    current=Depends(require_permission("Edit Tests", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR)),
    service: TestService = Depends(_service_from_db),
):
    try:
        return service.get_test(test_id, actor=_actor_from_current(current))
    except TestServiceError as exc:
        return _json_error(exc)


@router.patch("/{test_id}", response_model=TestResponseDTO)
async def update_test(
    test_id: str,
    body: TestUpdateDTO,
    request: Request,
    current=Depends(require_permission("Edit Tests", RoleEnum.ADMIN)),
    service: TestService = Depends(_service_from_db),
):
    try:
        return service.update_test(
            test_id=test_id,
            body=body,
            actor=_actor_from_current(current),
            request_ip=_request_ip(request),
        )
    except TestServiceError as exc:
        return _json_error(exc)


@router.post("/{test_id}/publish", response_model=TestResponseDTO)
async def publish_test(
    test_id: str,
    current=Depends(require_permission("Edit Tests", RoleEnum.ADMIN)),
    service: TestService = Depends(_service_from_db),
):
    try:
        return service.publish_test(test_id=test_id, actor=_actor_from_current(current))
    except TestServiceError as exc:
        return _json_error(exc)


@router.post("/{test_id}/duplicate", response_model=TestResponseDTO)
async def duplicate_test(
    test_id: str,
    request: Request,
    current=Depends(require_permission("Create Tests", RoleEnum.ADMIN)),
    service: TestService = Depends(_service_from_db),
):
    try:
        return service.duplicate_test(
            test_id=test_id,
            actor=_actor_from_current(current),
            request_ip=_request_ip(request),
        )
    except TestServiceError as exc:
        return _json_error(exc)


@router.post("/{test_id}/archive", response_model=TestResponseDTO)
async def archive_test(
    test_id: str,
    current=Depends(require_permission("Edit Tests", RoleEnum.ADMIN)),
    service: TestService = Depends(_service_from_db),
):
    try:
        return service.archive_test(test_id=test_id, actor=_actor_from_current(current))
    except TestServiceError as exc:
        return _json_error(exc)


@router.post("/{test_id}/unarchive", response_model=TestResponseDTO)
async def unarchive_test(
    test_id: str,
    current=Depends(require_permission("Edit Tests", RoleEnum.ADMIN)),
    service: TestService = Depends(_service_from_db),
):
    try:
        return service.unarchive_test(test_id=test_id, actor=_actor_from_current(current))
    except TestServiceError as exc:
        return _json_error(exc)


@router.delete("/{test_id}", status_code=204)
async def delete_test(
    test_id: str,
    request: Request,
    current=Depends(require_permission("Delete Tests", RoleEnum.ADMIN)),
    service: TestService = Depends(_service_from_db),
):
    try:
        service.delete_test(
            test_id=test_id,
            actor=_actor_from_current(current),
            request_ip=_request_ip(request),
        )
        return Response(status_code=204)
    except TestServiceError as exc:
        return _json_error(exc)


@router.get("/{test_id}/report")
async def download_report(
    test_id: str,
    current=Depends(require_permission("Generate Reports", RoleEnum.ADMIN)),
    service: TestService = Depends(_service_from_db),
):
    try:
        return HTMLResponse(
            content=service.render_report(test_id, actor=_actor_from_current(current)),
            media_type="text/html",
        )
    except TestServiceError as exc:
        return _json_error(exc)
