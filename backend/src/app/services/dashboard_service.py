from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..api.deps import ensure_permission, learner_can_access_exam
from ..models import Attempt, AttemptStatus, Exam, RoleEnum, Schedule
from ..schemas import DashboardRead, ScheduleRead
from .normalized_relations import is_exam_pool_library


def build_dashboard(*, db: Session, current) -> DashboardRead:
    ensure_permission(db, current, "View Dashboard")
    now = datetime.now(timezone.utc)

    attempts_query = select(Attempt)
    if current.role == RoleEnum.LEARNER:
        attempts_query = attempts_query.where(Attempt.user_id == current.id)
    attempts = db.scalars(attempts_query).all()

    schedules_query = select(Schedule).where(Schedule.scheduled_at >= now)
    if current.role == RoleEnum.LEARNER:
        schedules_query = schedules_query.where(Schedule.user_id == current.id)
    upcoming = db.scalars(schedules_query).all()

    tests = [test for test in db.scalars(select(Exam)).all() if not is_exam_pool_library(test)]
    if current.role == RoleEnum.LEARNER:
        tests = [test for test in tests if learner_can_access_exam(db, test, current, now=now)]

    scored = [attempt.score for attempt in attempts if attempt.score is not None]
    in_progress = sum(1 for attempt in attempts if attempt.status == AttemptStatus.IN_PROGRESS)

    return DashboardRead(
        total_exams=len(tests),
        total_attempts=len(attempts),
        in_progress_attempts=in_progress,
        completed_attempts=len(attempts) - in_progress,
        best_score=max(scored, default=None),
        average_score=(sum(scored) / len(scored)) if scored else None,
        upcoming_count=len(upcoming),
        upcoming_schedules=[_serialize_schedule(schedule) for schedule in upcoming],
    )


def _serialize_schedule(schedule: Schedule) -> ScheduleRead:
    test = schedule.exam
    test_type = getattr(test, "type", None) if test else None
    test_type_value = getattr(test_type, "value", test_type) if test_type else None
    test_title = test.title if test else None
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
        user_name=schedule.user.name if schedule.user else None,
        user_student_id=schedule.user.user_id if schedule.user else None,
        test_title=test_title,
        exam_title=test.title if test else None,
        exam_type=test_type,
        exam_time_limit=test.time_limit if test else None,
        test_name=test_title,
        test_type=test_type_value,
        test_time_limit=test.time_limit if test else None,
    )
