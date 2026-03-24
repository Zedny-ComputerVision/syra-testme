from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from ..api.deps import ensure_permission, normalize_utc_datetime, parse_uuid_param
from ..models import Attempt, AttemptStatus, Exam, RoleEnum, Schedule
from ..schemas import ExamRead, Message, ScheduleBase, ScheduleRead, ScheduleUpdate
from .audit import write_audit_log
from .normalized_relations import exam_archived_at, exam_certificate, exam_proctoring, exam_runtime_settings
from .notifications import notify_user

logger = logging.getLogger(__name__)


def ensure_exam_schedulable(exam: Exam | None) -> None:
    if exam and exam_archived_at(exam):
        raise HTTPException(status_code=400, detail="Cannot schedule an archived test")


def validate_schedule_time(
    scheduled_at: datetime | None,
    *,
    allow_existing_past: bool = False,
    previous_scheduled_at: datetime | None = None,
) -> None:
    normalized = normalize_utc_datetime(scheduled_at)
    previous_normalized = normalize_utc_datetime(previous_scheduled_at)
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=1)
    if (
        normalized
        and normalized < cutoff
        and not (allow_existing_past and previous_normalized and previous_normalized < cutoff)
    ):
        raise HTTPException(status_code=422, detail="Cannot schedule in the past")


def serialize_schedule(schedule: Schedule) -> ScheduleRead:
    exam = schedule.exam
    user = getattr(schedule, "user", None)
    exam_type = getattr(exam, "type", None) if exam else None
    exam_type_value = getattr(exam_type, "value", exam_type) if exam_type else None
    test_title = exam.title if exam else None
    return ScheduleRead(
        id=schedule.id,
        exam_id=schedule.exam_id,
        test_id=schedule.exam_id,
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
        test_type=exam_type_value,
        test_time_limit=exam.time_limit if exam else None,
    )


def serialize_schedulable_test(exam: Exam) -> ExamRead:
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


def create_schedule(*, db: Session, body: ScheduleBase, actor) -> ScheduleRead:
    exam_id = body.exam_id or body.test_id
    exam = db.get(Exam, exam_id) if exam_id else None
    if exam_id and not exam:
        raise HTTPException(status_code=404, detail="Test not found")
    ensure_exam_schedulable(exam)
    existing = db.scalar(select(Schedule).where(Schedule.user_id == body.user_id, Schedule.exam_id == exam_id))
    if existing:
        raise HTTPException(status_code=409, detail="Schedule already exists")
    validate_schedule_time(body.scheduled_at)
    now = datetime.now(timezone.utc)
    payload = body.model_dump(exclude={"test_id"})
    payload["exam_id"] = exam_id
    schedule = Schedule(**payload, created_at=now, updated_at=now)
    try:
        db.add(schedule)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Failed to create schedule for user %s and test %s", body.user_id, exam_id)
        raise HTTPException(status_code=409, detail="Schedule already exists")
    db.refresh(schedule)
    write_audit_log(
        db,
        getattr(actor, "id", None),
        action="SCHEDULE_CREATED",
        resource_type="schedule",
        resource_id=str(schedule.id),
        detail=f"exam={schedule.exam_id}; user={schedule.user_id}; mode={schedule.access_mode.value}",
    )
    notify_schedule_change(db, schedule, updated=False)
    return serialize_schedule(schedule)


def list_schedulable_tests(*, db: Session) -> list[ExamRead]:
    exams = db.scalars(
        select(Exam)
        .options(joinedload(Exam.node), joinedload(Exam.category), joinedload(Exam.questions))
        .where(Exam.library_pool_id.is_(None))
        .order_by(Exam.created_at.desc())
    ).all()
    return [serialize_schedulable_test(exam) for exam in exams]


def list_schedules(*, db: Session, current) -> list[ScheduleRead]:
    query = select(Schedule).options(joinedload(Schedule.exam), joinedload(Schedule.user)).order_by(Schedule.scheduled_at.asc())
    if current.role == RoleEnum.LEARNER:
        query = query.where(Schedule.user_id == current.id)
    else:
        ensure_permission(db, current, "Assign Schedules")
    schedules = db.execute(query).unique().scalars().all()
    return [serialize_schedule(schedule) for schedule in schedules]


def update_schedule(*, db: Session, schedule_id: str, body: ScheduleUpdate, actor) -> ScheduleRead:
    schedule_pk = parse_uuid_param(schedule_id, detail="Not found")
    schedule = db.get(Schedule, schedule_pk)
    if not schedule:
        raise HTTPException(status_code=404, detail="Not found")
    payload = body.model_dump(exclude_unset=True)
    new_exam_id = payload.get("exam_id") or payload.get("test_id")
    target_exam_id = new_exam_id or schedule.exam_id
    target_exam = db.get(Exam, target_exam_id) if target_exam_id else None
    if new_exam_id and not target_exam:
        raise HTTPException(status_code=404, detail="Test not found")
    ensure_exam_schedulable(target_exam)
    previous_scheduled_at = schedule.scheduled_at
    for field, value in payload.items():
        if value is None and field == "scheduled_at":
            continue
        setattr(schedule, field, value)
    validate_schedule_time(
        schedule.scheduled_at,
        allow_existing_past=True,
        previous_scheduled_at=previous_scheduled_at,
    )
    schedule.updated_at = datetime.now(timezone.utc)
    try:
        db.add(schedule)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Failed to update schedule %s", schedule_id)
        raise
    db.refresh(schedule)
    scheduled_at_str = schedule.scheduled_at.isoformat() if schedule.scheduled_at else "unset"
    write_audit_log(
        db,
        getattr(actor, "id", None),
        action="SCHEDULE_UPDATED",
        resource_type="schedule",
        resource_id=str(schedule.id),
        detail=f"mode={schedule.access_mode.value}; scheduled_at={scheduled_at_str}",
    )
    notify_schedule_change(db, schedule, updated=True)
    return serialize_schedule(schedule)


def delete_schedule(*, db: Session, schedule_id: str, actor) -> Message:
    schedule_pk = parse_uuid_param(schedule_id, detail="Not found")
    schedule = db.get(Schedule, schedule_pk)
    if not schedule:
        raise HTTPException(status_code=404, detail="Not found")
    active_attempt = db.scalar(
        select(Attempt.id)
        .where(
            Attempt.exam_id == schedule.exam_id,
            Attempt.user_id == schedule.user_id,
            Attempt.status == AttemptStatus.IN_PROGRESS,
        )
        .limit(1)
    )
    if active_attempt:
        raise HTTPException(status_code=409, detail="Cannot delete schedule while user has an active attempt")
    detail = f"exam={schedule.exam_id}; user={schedule.user_id}"
    try:
        db.delete(schedule)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Failed to delete schedule %s", schedule_id)
        raise
    write_audit_log(
        db,
        getattr(actor, "id", None),
        action="SCHEDULE_DELETED",
        resource_type="schedule",
        resource_id=schedule_id,
        detail=detail,
    )
    return Message(detail="Deleted")


def notify_schedule_change(db: Session, schedule: Schedule, *, updated: bool) -> None:
    scheduled_at = schedule.scheduled_at.isoformat() if schedule.scheduled_at else "unspecified time"
    title = "Schedule updated" if updated else "Schedule created"
    action = "updated" if updated else "scheduled"
    notify_user(
        db,
        schedule.user_id,
        title=title,
        message=f"{schedule_title(schedule)} has been {action} for {scheduled_at}.",
        link="/schedule",
    )


def schedule_title(schedule: Schedule) -> str:
    exam = schedule.exam
    return getattr(exam, "title", None) or "Scheduled test"
