from fastapi import APIRouter, Depends, Query

from ...models import RoleEnum
from ...models import Schedule
from ...schemas import ExamRead, Message, ScheduleBase, ScheduleRead, ScheduleUpdate
from ...services import schedule_service as _schedule_service
from ...services.audit import write_audit_log
from ...services.schedule_service import (
    create_schedule as create_schedule_service,
    delete_schedule as delete_schedule_service,
    list_schedulable_tests as list_schedulable_tests_service,
    list_schedules as list_schedules_service,
    update_schedule as update_schedule_service,
)
from ..deps import get_current_user, get_db_dep, require_permission

router = APIRouter()


def _write_schedule_audit_log(*args, **kwargs):
    return write_audit_log(*args, **kwargs)


_schedule_service.write_audit_log = _write_schedule_audit_log


@router.post("/", response_model=ScheduleRead)
async def create_schedule(
    body: ScheduleBase,
    db=Depends(get_db_dep),
    current=Depends(require_permission("Assign Schedules", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR)),
):
    return create_schedule_service(db=db, body=body, actor=current)


@router.get("/tests", response_model=list[ExamRead])
async def list_schedulable_tests(
    db=Depends(get_db_dep),
    current=Depends(require_permission("Assign Schedules", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR)),
):
    return list_schedulable_tests_service(db=db, current=current)


@router.get("/", response_model=list[ScheduleRead])
async def list_schedules(
    exam_id: str | None = Query(None),
    db=Depends(get_db_dep),
    current=Depends(get_current_user),
):
    return list_schedules_service(db=db, current=current, exam_id=exam_id)


@router.put("/{schedule_id}", response_model=ScheduleRead)
async def update_schedule(
    schedule_id: str,
    body: ScheduleUpdate,
    db=Depends(get_db_dep),
    current=Depends(require_permission("Assign Schedules", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR)),
):
    return update_schedule_service(db=db, schedule_id=schedule_id, body=body, actor=current)


@router.delete("/{schedule_id}", response_model=Message)
async def delete_schedule(
    schedule_id: str,
    db=Depends(get_db_dep),
    current=Depends(require_permission("Assign Schedules", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR)),
):
    return delete_schedule_service(db=db, schedule_id=schedule_id, actor=current)


__all__ = [
    "router",
    "Schedule",
    "write_audit_log",
    "create_schedule",
    "list_schedulable_tests",
    "list_schedules",
    "update_schedule",
    "delete_schedule",
]
