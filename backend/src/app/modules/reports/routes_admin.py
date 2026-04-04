from __future__ import annotations

from fastapi import APIRouter, Depends

from ...api.deps import get_db_dep, require_permission
from ...models import RoleEnum
from .repository import ReportRepository
from .schemas import (
    CustomReportExportRequest,
    CustomReportPreview,
    Message,
    ReportScheduleCreate,
    ReportScheduleRead,
    ReportScheduleRunResult,
)
from .service import ReportService


router = APIRouter()
schedule_router = APIRouter()


def _service_from_db(db=Depends(get_db_dep)) -> ReportService:
    return ReportService(ReportRepository(db))


@router.post("/export/preview", response_model=CustomReportPreview)
def preview_custom_report(
    body: CustomReportExportRequest,
    current=Depends(require_permission("Generate Reports", RoleEnum.ADMIN)),
    service: ReportService = Depends(_service_from_db),
):
    return service.preview_custom_report(body, actor_id=getattr(current, "id", None), actor_role=getattr(current, "role", None))


@router.post("/export")
def export_custom_report(
    body: CustomReportExportRequest,
    current=Depends(require_permission("Generate Reports", RoleEnum.ADMIN)),
    service: ReportService = Depends(_service_from_db),
):
    return service.export_custom_report(body=body, actor_id=getattr(current, "id", None), actor_role=getattr(current, "role", None))


@router.post("/predefined/{slug}")
def generate_predefined_report(
    slug: str,
    current=Depends(require_permission("Generate Reports", RoleEnum.ADMIN)),
    service: ReportService = Depends(_service_from_db),
):
    return service.generate_predefined_report(
        slug=slug,
        actor_id=getattr(current, "id", None),
        actor_role=getattr(current, "role", None),
    )


@router.get("/test/{test_id}")
def generate_test_report(
    test_id: str,
    current=Depends(require_permission("Generate Reports", RoleEnum.ADMIN)),
    service: ReportService = Depends(_service_from_db),
):
    return service.generate_test_report_csv(test_id=test_id, actor_id=getattr(current, "id", None))


@router.get("/exam/{exam_id}")
def generate_exam_report(
    exam_id: str,
    current=Depends(require_permission("Generate Reports", RoleEnum.ADMIN)),
    service: ReportService = Depends(_service_from_db),
):
    return service.generate_test_report_csv(test_id=exam_id, actor_id=getattr(current, "id", None))


@router.get("/test/{test_id}/pdf")
def generate_test_report_pdf(
    test_id: str,
    current=Depends(require_permission("Generate Reports", RoleEnum.ADMIN)),
    service: ReportService = Depends(_service_from_db),
):
    return service.generate_test_report_pdf(test_id=test_id, actor_id=getattr(current, "id", None))


@router.get("/exam/{exam_id}/pdf")
def generate_exam_report_pdf(
    exam_id: str,
    current=Depends(require_permission("Generate Reports", RoleEnum.ADMIN)),
    service: ReportService = Depends(_service_from_db),
):
    return service.generate_test_report_pdf(test_id=exam_id, actor_id=getattr(current, "id", None))


@schedule_router.post("/", response_model=ReportScheduleRead)
def create_report_schedule(
    body: ReportScheduleCreate,
    current=Depends(require_permission("Generate Reports", RoleEnum.ADMIN)),
    service: ReportService = Depends(_service_from_db),
):
    return service.create_report_schedule(body=body, actor_id=getattr(current, "id", None))


@schedule_router.get("/", response_model=list[ReportScheduleRead])
def list_report_schedules(
    current=Depends(require_permission("Generate Reports", RoleEnum.ADMIN)),
    service: ReportService = Depends(_service_from_db),
):
    return service.list_report_schedules(actor_id=getattr(current, "id", None))


@schedule_router.get("/{schedule_id}", response_model=ReportScheduleRead)
def get_report_schedule(
    schedule_id: str,
    current=Depends(require_permission("Generate Reports", RoleEnum.ADMIN)),
    service: ReportService = Depends(_service_from_db),
):
    return service.get_report_schedule(schedule_id, actor_id=getattr(current, "id", None))


@schedule_router.delete("/{schedule_id}", response_model=Message)
def delete_report_schedule(
    schedule_id: str,
    current=Depends(require_permission("Generate Reports", RoleEnum.ADMIN)),
    service: ReportService = Depends(_service_from_db),
):
    return service.delete_report_schedule(schedule_id=schedule_id, actor_id=getattr(current, "id", None))


@schedule_router.post("/{schedule_id}/run", response_model=ReportScheduleRunResult)
async def run_schedule_now(
    schedule_id: str,
    current=Depends(require_permission("Generate Reports", RoleEnum.ADMIN)),
    service: ReportService = Depends(_service_from_db),
):
    return await service.run_schedule_now(schedule_id=schedule_id, actor_id=getattr(current, "id", None))


__all__ = ["router", "schedule_router"]
