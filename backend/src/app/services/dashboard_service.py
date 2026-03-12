from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import case, exists, func, or_, select
from sqlalchemy.orm import Session, joinedload

from ..api.deps import ensure_permission
from ..models import AccessMode, Attempt, AttemptStatus, Exam, ExamStatus, RoleEnum, Schedule, User
from ..schemas import DashboardRead, ScheduleRead


def build_dashboard(*, db: Session, current) -> DashboardRead:
    ensure_permission(db, current, "View Dashboard")
    now = datetime.now(timezone.utc)

    if current.role == RoleEnum.LEARNER:
        attempts_metrics = db.execute(
            select(
                func.count(Attempt.id),
                func.sum(case((Attempt.status == AttemptStatus.IN_PROGRESS, 1), else_=0)),
                func.max(Attempt.score),
                func.avg(Attempt.score),
            ).where(Attempt.user_id == current.id)
        ).one()
        total_attempts = int(attempts_metrics[0] or 0)
        in_progress = int(attempts_metrics[1] or 0)
        best_score = attempts_metrics[2]
        average_score = attempts_metrics[3]

        restricted_schedule_exists = exists(
            select(Schedule.id).where(
                Schedule.exam_id == Exam.id,
                Schedule.access_mode == AccessMode.RESTRICTED,
            )
        )
        learner_schedule_available = exists(
            select(Schedule.id).where(
                Schedule.exam_id == Exam.id,
                Schedule.user_id == current.id,
                Schedule.scheduled_at <= now,
            )
        )
        visible_tests = (
            db.scalar(
                select(func.count(Exam.id)).where(
                    Exam.library_pool_id.is_(None),
                    Exam.status == ExamStatus.OPEN,
                    or_(~restricted_schedule_exists, learner_schedule_available),
                )
            )
            or 0
        )
        upcoming = db.scalars(
            select(Schedule)
            .options(joinedload(Schedule.exam), joinedload(Schedule.user))
            .where(
                Schedule.user_id == current.id,
                Schedule.scheduled_at >= now,
            )
            .order_by(Schedule.scheduled_at.asc())
        ).all()
        return DashboardRead(
            total_exams=visible_tests,
            total_tests=visible_tests,
            total_users=0,
            total_learners=0,
            total_admins=0,
            published_tests=visible_tests,
            total_attempts=total_attempts,
            in_progress_attempts=in_progress,
            completed_attempts=total_attempts - in_progress,
            best_score=best_score,
            average_score=average_score,
            upcoming_count=len(upcoming),
            upcoming_schedules=[_serialize_schedule(schedule) for schedule in upcoming],
        )

    attempts_metrics = db.execute(
        select(
            func.count(Attempt.id),
            func.sum(case((Attempt.status == AttemptStatus.IN_PROGRESS, 1), else_=0)),
            func.max(Attempt.score),
            func.avg(Attempt.score),
        )
    ).one()
    total_attempts = int(attempts_metrics[0] or 0)
    in_progress = int(attempts_metrics[1] or 0)
    best_score = attempts_metrics[2]
    average_score = attempts_metrics[3]

    schedules_query = select(Schedule).where(Schedule.scheduled_at >= now).order_by(Schedule.scheduled_at.asc())
    upcoming = db.scalars(schedules_query).all()

    tests_metrics = db.execute(
        select(
            func.count(Exam.id),
            func.sum(case((Exam.status == ExamStatus.OPEN, 1), else_=0)),
        ).where(Exam.library_pool_id.is_(None))
    ).one()
    total_tests = int(tests_metrics[0] or 0)
    published_tests = int(tests_metrics[1] or 0)

    total_users = 0
    total_learners = 0
    total_admins = 0
    if current.role in {RoleEnum.ADMIN, RoleEnum.INSTRUCTOR}:
        users_metrics = db.execute(
            select(
                func.count(User.id),
                func.sum(case((User.role == RoleEnum.LEARNER, 1), else_=0)),
                func.sum(case((User.role == RoleEnum.ADMIN, 1), else_=0)),
            )
        ).one()
        total_users = int(users_metrics[0] or 0)
        total_learners = int(users_metrics[1] or 0)
        total_admins = int(users_metrics[2] or 0)

    return DashboardRead(
        total_exams=total_tests,
        total_tests=total_tests,
        total_users=total_users,
        total_learners=total_learners,
        total_admins=total_admins,
        published_tests=published_tests,
        total_attempts=total_attempts,
        in_progress_attempts=in_progress,
        completed_attempts=total_attempts - in_progress,
        best_score=best_score,
        average_score=average_score,
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
