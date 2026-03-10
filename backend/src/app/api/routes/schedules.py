from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...models import Attempt, AttemptStatus, Schedule, RoleEnum, Exam
from ...modules.tests.models import Test
from ...schemas import ExamRead, Message, ScheduleBase, ScheduleRead, ScheduleUpdate
from ...services.normalized_relations import exam_certificate, exam_proctoring, exam_runtime_settings
from ...services.audit import write_audit_log
from ...services.notifications import notify_user
from ..deps import ensure_permission, get_current_user, get_db_dep, normalize_utc_datetime, parse_uuid_param, require_permission

router = APIRouter()


def _validate_schedule_time(scheduled_at: datetime | None) -> None:
    normalized = normalize_utc_datetime(scheduled_at)
    if normalized and normalized < datetime.now(timezone.utc) - timedelta(minutes=1):
        raise HTTPException(status_code=422, detail="Cannot schedule in the past")


def _schedule_title(schedule: Schedule) -> str:
    exam = schedule.exam
    test = getattr(schedule, "test", None)
    return getattr(exam, "title", None) or getattr(test, "name", None) or "Scheduled test"


def _notify_schedule_change(db: Session, schedule: Schedule, *, updated: bool) -> None:
    scheduled_at = schedule.scheduled_at.isoformat() if schedule.scheduled_at else "unspecified time"
    title = "Schedule updated" if updated else "Schedule created"
    action = "updated" if updated else "scheduled"
    notify_user(
        db,
        schedule.user_id,
        title=title,
        message=f"{_schedule_title(schedule)} has been {action} for {scheduled_at}.",
        link="/schedule",
    )


def _build(schedule: Schedule) -> ScheduleRead:
    exam = schedule.exam
    test = getattr(schedule, "test", None)
    user = getattr(schedule, "user", None)
    exam_type = getattr(exam, "type", None) if exam else None
    test_type_value = getattr(getattr(test, "type", None), "value", getattr(test, "type", None)) if test else None
    exam_type_value = getattr(exam_type, "value", exam_type) if exam_type else None
    test_title = test.name if test else (exam.title if exam else None)
    test_type = test_type_value if test else exam_type_value
    test_time_limit = test.time_limit_minutes if test else (exam.time_limit if exam else None)
    return ScheduleRead(
        id=schedule.id,
        exam_id=schedule.exam_id,
        test_id=schedule.test_id,
        user_id=schedule.user_id,
        scheduled_at=schedule.scheduled_at,
        access_mode=schedule.access_mode,
        notes=schedule.notes,
        created_at=schedule.created_at,
        updated_at=schedule.updated_at,
        user_name=user.name if user else None,
        user_student_id=user.user_id if user else None,
        test_title=test_title,
        exam_title=exam.title if exam else None,
        exam_type=exam_type,
        exam_time_limit=exam.time_limit if exam else None,
        test_name=test_title,
        test_type=test_type,
        test_time_limit=test_time_limit,
    )


def _build_exam(exam: Exam) -> ExamRead:
    node = exam.node
    course = node.course if node else None
    category_name = exam.category.name if exam.category else None
    return ExamRead(
        id=exam.id,
        node_id=exam.node_id,
        node_title=node.title if node else None,
        course_id=course.id if course else None,
        course_title=course.title if course else None,
        title=exam.title,
        type=exam.type,
        status=exam.status,
        time_limit=exam.time_limit,
        max_attempts=exam.max_attempts,
        passing_score=exam.passing_score,
        proctoring_config=exam_proctoring(exam),
        description=exam.description,
        settings=exam_runtime_settings(exam),
        certificate=exam_certificate(exam),
        category_id=exam.category_id,
        grading_scale_id=exam.grading_scale_id,
        category_name=category_name,
        created_at=exam.created_at,
        updated_at=exam.updated_at,
        question_count=exam.question_count,
    )


@router.post("/", response_model=ScheduleRead)
async def create_schedule(body: ScheduleBase, db: Session = Depends(get_db_dep), current=Depends(require_permission("Assign Schedules", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    if body.exam_id and not db.get(Exam, body.exam_id):
        raise HTTPException(status_code=404, detail="Test not found")
    if body.test_id and not db.get(Test, body.test_id):
        raise HTTPException(status_code=404, detail="Test not found")
    if body.exam_id:
        existing = db.scalar(select(Schedule).where(Schedule.user_id == body.user_id, Schedule.exam_id == body.exam_id))
    else:
        existing = db.scalar(select(Schedule).where(Schedule.user_id == body.user_id, Schedule.test_id == body.test_id))
    if existing:
        raise HTTPException(status_code=409, detail="Schedule already exists")
    _validate_schedule_time(body.scheduled_at)
    now = datetime.now(timezone.utc)
    s = Schedule(**body.model_dump(), created_at=now, updated_at=now)
    db.add(s)
    db.commit()
    db.refresh(s)
    write_audit_log(
        db,
        getattr(current, "id", None),
        action="SCHEDULE_CREATED",
        resource_type="schedule",
        resource_id=str(s.id),
        detail=f"exam={s.exam_id}; user={s.user_id}; mode={s.access_mode.value}",
    )
    _notify_schedule_change(db, s, updated=False)
    return _build(s)


@router.get("/tests", response_model=list[ExamRead])
async def list_schedulable_tests(
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("Assign Schedules", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR)),
):
    exams = db.scalars(select(Exam).order_by(Exam.created_at.desc())).all()
    return [_build_exam(exam) for exam in exams]


@router.get("/", response_model=list[ScheduleRead])
async def list_schedules(db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    query = select(Schedule)
    if current.role == RoleEnum.LEARNER:
        query = query.where(Schedule.user_id == current.id)
    else:
        ensure_permission(db, current, "Assign Schedules")
    schedules = db.scalars(query).all()
    return [_build(s) for s in schedules]


@router.put("/{schedule_id}", response_model=ScheduleRead)
async def update_schedule(
    schedule_id: str,
    body: ScheduleUpdate,
    db: Session = Depends(get_db_dep),
    current=Depends(require_permission("Assign Schedules", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR)),
):
    schedule_pk = parse_uuid_param(schedule_id, detail="Not found")
    s = db.get(Schedule, schedule_pk)
    if not s:
        raise HTTPException(status_code=404, detail="Not found")
    payload = body.model_dump(exclude_unset=True)
    for field, value in payload.items():
        if value is None and field == "scheduled_at":
            continue
        setattr(s, field, value)
    s.updated_at = datetime.now(timezone.utc)
    db.add(s)
    db.commit()
    db.refresh(s)
    scheduled_at_str = s.scheduled_at.isoformat() if s.scheduled_at else "unset"
    write_audit_log(
        db,
        getattr(current, "id", None),
        action="SCHEDULE_UPDATED",
        resource_type="schedule",
        resource_id=str(s.id),
        detail=f"mode={s.access_mode.value}; scheduled_at={scheduled_at_str}",
    )
    _notify_schedule_change(db, s, updated=True)
    return _build(s)


@router.delete("/{schedule_id}", response_model=Message)
async def delete_schedule(schedule_id: str, db: Session = Depends(get_db_dep), current=Depends(require_permission("Assign Schedules", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    schedule_pk = parse_uuid_param(schedule_id, detail="Not found")
    s = db.get(Schedule, schedule_pk)
    if not s:
        raise HTTPException(status_code=404, detail="Not found")
    active_attempt = db.scalar(
        select(Attempt.id)
        .where(
            Attempt.exam_id == s.exam_id,
            Attempt.user_id == s.user_id,
            Attempt.status == AttemptStatus.IN_PROGRESS,
        )
        .limit(1)
    )
    if active_attempt:
        raise HTTPException(status_code=409, detail="Cannot delete schedule while user has an active attempt")
    detail = f"exam={s.exam_id}; user={s.user_id}"
    db.delete(s)
    db.commit()
    write_audit_log(
        db,
        getattr(current, "id", None),
        action="SCHEDULE_DELETED",
        resource_type="schedule",
        resource_id=schedule_id,
        detail=detail,
    )
    return Message(detail="Deleted")
