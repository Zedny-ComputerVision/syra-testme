from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from ...api.deps import get_db_dep, require_role
from ...models import RoleEnum
from .enums import TestStatus, TestType
from .schemas import TestCreate, TestUpdate, TestListResponse, TestDetail
from .service import TestService, http_error

router = APIRouter(prefix="/admin/tests", tags=["tests"])


# Helpers

def _serialize_test(test) -> TestDetail:
    settings = test.settings
    if settings is None:
        settings_payload = {}
    else:
        settings_payload = {
            "fullscreen_required": settings.fullscreen_required,
            "tab_switch_detect": settings.tab_switch_detect,
            "camera_required": settings.camera_required,
            "mic_required": settings.mic_required,
            "violation_threshold_warn": settings.violation_threshold_warn,
            "violation_threshold_autosubmit": settings.violation_threshold_autosubmit,
        }
    return TestDetail.model_validate({
        "id": test.id,
        "code": test.code,
        "name": test.name,
        "description": test.description,
        "type": test.type,
        "status": test.status,
        "category_id": test.category_id,
        "time_limit_minutes": test.time_limit_minutes,
        "attempts_allowed": test.attempts_allowed,
        "randomize_questions": test.randomize_questions,
        "report_displayed": test.report_displayed,
        "report_content": test.report_content,
        "ui_config": test.ui_config,
        "settings": settings_payload,
        "created_at": test.created_at,
        "updated_at": test.updated_at,
        "published_at": test.published_at,
        "archived_at": test.archived_at,
    })


def _serialize_list_item(test, testing_sessions: int = 0):
    category = None
    if getattr(test, "category", None):
        category = {"id": test.category.id, "name": test.category.name}
    return {
        "id": test.id,
        "code": test.code,
        "name": test.name,
        "type": test.type,
        "status": test.status,
        "category": category,
        "time_limit_minutes": test.time_limit_minutes,
        "testing_sessions": testing_sessions,
        "created_at": test.created_at,
        "updated_at": test.updated_at,
    }


def _format_error_response(exc: HTTPException):
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    raise exc


@router.get("/", response_model=TestListResponse)
async def list_tests(
    search: Optional[str] = None,
    status: Optional[str] = None,
    type: Optional[str] = None,
    category_id: Optional[str] = None,
    created_from: Optional[str] = None,
    created_to: Optional[str] = None,
    sort: Optional[str] = None,
    page: int = 1,
    page_size: int = 10,
    db: Session = Depends(get_db_dep),
    current=Depends(require_role(RoleEnum.ADMIN)),
):
    try:
        svc = TestService(db)
        statuses = None
        if status:
            try:
                statuses = [TestStatus(s) for s in status.split(",") if s]
            except ValueError:
                http_error("VALIDATION_ERROR", "Invalid status filter")
        test_type = None
        if type:
            try:
                test_type = TestType(type)
            except ValueError:
                http_error("VALIDATION_ERROR", "Invalid type filter")
        try:
            cf = datetime.fromisoformat(created_from) if created_from else None
            ct = datetime.fromisoformat(created_to) if created_to else None
        except ValueError:
            http_error("VALIDATION_ERROR", "Invalid created_from or created_to format")

        items, total = svc.list(
            search=search,
            status=statuses,
            type=test_type,
            category_id=category_id,
            created_from=cf,
            created_to=ct,
            sort=sort,
            page=page,
            page_size=page_size,
        )
        resp_items = [_serialize_list_item(test, testing_sessions=svc.repo.count_attempts(test.id)) for test in items]
        return TestListResponse(items=resp_items, page=page, page_size=page_size, total=total)
    except HTTPException as exc:
        return _format_error_response(exc)


@router.post("/", response_model=TestDetail, status_code=201)
async def create_test(body: TestCreate, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN))):
    try:
        svc = TestService(db)
        test = svc.create(body)
        return _serialize_test(test)
    except HTTPException as exc:
        return _format_error_response(exc)


@router.get("/{test_id}", response_model=TestDetail)
async def get_test(test_id: str, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN))):
    try:
        svc = TestService(db)
        test = svc.get_or_404(test_id)
        return _serialize_test(test)
    except HTTPException as exc:
        return _format_error_response(exc)


@router.patch("/{test_id}", response_model=TestDetail)
async def update_test(test_id: str, body: TestUpdate, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN))):
    try:
        svc = TestService(db)
        test = svc.get_or_404(test_id)
        test = svc.update(test, body)
        return _serialize_test(test)
    except HTTPException as exc:
        return _format_error_response(exc)


@router.post("/{test_id}/publish", response_model=TestDetail)
async def publish_test(test_id: str, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN))):
    try:
        svc = TestService(db)
        test = svc.get_or_404(test_id)
        test = svc.publish(test)
        return _serialize_test(test)
    except HTTPException as exc:
        return _format_error_response(exc)


@router.post("/{test_id}/duplicate", response_model=TestDetail)
async def duplicate_test(test_id: str, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN))):
    try:
        svc = TestService(db)
        test = svc.get_or_404(test_id)
        new_test = svc.duplicate(test)
        return _serialize_test(new_test)
    except HTTPException as exc:
        return _format_error_response(exc)


@router.post("/{test_id}/archive", response_model=TestDetail)
async def archive_test(test_id: str, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN))):
    try:
        svc = TestService(db)
        test = svc.get_or_404(test_id)
        test = svc.archive(test)
        return _serialize_test(test)
    except HTTPException as exc:
        return _format_error_response(exc)


@router.post("/{test_id}/unarchive", response_model=TestDetail)
async def unarchive_test(test_id: str, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN))):
    try:
        svc = TestService(db)
        test = svc.get_or_404(test_id)
        test = svc.unarchive(test)
        return _serialize_test(test)
    except HTTPException as exc:
        return _format_error_response(exc)


@router.delete("/{test_id}", status_code=204)
async def delete_test(test_id: str, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN))):
    try:
        svc = TestService(db)
        test = svc.get_or_404(test_id)
        svc.delete(test)
        return Response(status_code=204)
    except HTTPException as exc:
        return _format_error_response(exc)


@router.get("/{test_id}/report")
async def download_report(test_id: str, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN))):
    try:
        # Stub: always 404 for now
        http_error("NOT_FOUND", "Report not available")
    except HTTPException as exc:
        return _format_error_response(exc)
