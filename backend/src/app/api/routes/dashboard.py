from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ...models import Attempt, Exam, ExamStatus, Schedule, RoleEnum, AttemptStatus
from ...schemas import DashboardRead, ScheduleRead
from ..deps import ensure_permission, get_current_user, get_db_dep, learner_can_access_exam

router = APIRouter()


def _build_schedule_read(s: Schedule) -> ScheduleRead:
    exam = s.exam
    test = getattr(s, "test", None)
    exam_type = getattr(exam, "type", None) if exam else None
    test_type_value = getattr(getattr(test, "type", None), "value", getattr(test, "type", None)) if test else None
    exam_type_value = getattr(exam_type, "value", exam_type) if exam_type else None
    test_title = test.name if test else (exam.title if exam else None)
    test_type = test_type_value if test else exam_type_value
    test_time_limit = test.time_limit_minutes if test else (exam.time_limit if exam else None)
    return ScheduleRead(
        id=s.id,
        exam_id=s.exam_id,
        test_id=s.test_id,
        user_id=s.user_id,
        scheduled_at=s.scheduled_at,
        access_mode=s.access_mode,
        notes=s.notes,
        created_at=s.created_at,
        updated_at=s.updated_at,
        user_name=s.user.name if s.user else None,
        user_student_id=s.user.user_id if s.user else None,
        test_title=test_title,
        exam_title=exam.title if exam else None,
        exam_type=exam_type,
        exam_time_limit=exam.time_limit if exam else None,
        test_name=test_title,
        test_type=test_type,
        test_time_limit=test_time_limit,
    )


def _is_pool_library_exam(exam: Exam) -> bool:
    settings = exam.settings if isinstance(exam.settings, dict) else {}
    return bool(settings.get("_pool_library"))


def _pool_library_filter(db: Session):
    dialect_name = getattr(getattr(db, "bind", None), "dialect", None)
    dialect_name = getattr(dialect_name, "name", None)
    if dialect_name == "sqlite":
        return func.json_extract(Exam.settings, "$._pool_library").is_(None)
    return func.jsonb_extract_path_text(Exam.settings, "_pool_library").is_(None)


@router.get("/", response_model=DashboardRead)
async def dashboard(db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    ensure_permission(db, current, "View Dashboard")
    now = datetime.now(timezone.utc)
    attempts_query = select(Attempt).where(Attempt.user_id == current.id) if current.role == RoleEnum.LEARNER else select(Attempt)
    attempts = db.scalars(attempts_query).all()
    total_attempts = len(attempts)
    in_progress = len([a for a in attempts if a.status == AttemptStatus.IN_PROGRESS]) if attempts else 0
    completed = len([a for a in attempts if a.status != AttemptStatus.IN_PROGRESS]) if attempts else 0
    best_score = max([a.score for a in attempts if a.score is not None], default=None)
    scored = [a.score for a in attempts if a.score is not None]
    avg_score = sum(scored) / len(scored) if scored else None
    schedules_query = select(Schedule)
    if current.role == RoleEnum.LEARNER:
        schedules_query = schedules_query.where(Schedule.user_id == current.id)
    schedules_query = schedules_query.where(Schedule.scheduled_at >= now)
    upcoming = db.scalars(schedules_query).all()
    exams = db.scalars(select(Exam).where(_pool_library_filter(db))).all()
    if current.role == RoleEnum.LEARNER:
        exams = [exam for exam in exams if learner_can_access_exam(db, exam, current, now=now)]
    return DashboardRead(
        total_exams=len(exams),
        total_attempts=total_attempts,
        in_progress_attempts=in_progress,
        completed_attempts=completed,
        best_score=best_score,
        average_score=avg_score,
        upcoming_count=len(upcoming),
        upcoming_schedules=[_build_schedule_read(s) for s in upcoming],
    )
