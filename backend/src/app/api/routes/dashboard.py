from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ...models import Attempt, Exam, Schedule, RoleEnum, AttemptStatus
from ...schemas import DashboardRead, ScheduleRead
from ..deps import get_current_user, get_db_dep

router = APIRouter()


def _build_schedule_read(s: Schedule) -> ScheduleRead:
    exam = s.exam
    return ScheduleRead(
        id=s.id,
        exam_id=s.exam_id,
        user_id=s.user_id,
        scheduled_at=s.scheduled_at,
        access_mode=s.access_mode,
        notes=s.notes,
        created_at=s.created_at,
        updated_at=s.updated_at,
        exam_title=exam.title if exam else None,
        exam_type=exam.type if exam else None,
        exam_time_limit=exam.time_limit if exam else None,
    )


@router.get("/", response_model=DashboardRead)
async def dashboard(db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    attempts_query = select(Attempt).where(Attempt.user_id == current.id) if current.role == RoleEnum.LEARNER else select(Attempt)
    attempts = db.scalars(attempts_query).all()
    total_attempts = len(attempts)
    in_progress = len([a for a in attempts if a.status == AttemptStatus.IN_PROGRESS]) if attempts else 0
    completed = len([a for a in attempts if a.status != AttemptStatus.IN_PROGRESS]) if attempts else 0
    best_score = max([a.score for a in attempts if a.score is not None], default=None)
    avg_score = (
        sum([a.score for a in attempts if a.score is not None]) / len([a for a in attempts if a.score is not None])
        if attempts
        else None
    )
    schedules_query = select(Schedule)
    if current.role == RoleEnum.LEARNER:
        schedules_query = schedules_query.where(Schedule.user_id == current.id)
    upcoming = db.scalars(schedules_query).all()
    return DashboardRead(
        total_exams=db.scalar(select(func.count(Exam.id))) or 0,
        total_attempts=total_attempts,
        in_progress_attempts=in_progress,
        completed_attempts=completed,
        best_score=best_score,
        average_score=avg_score,
        upcoming_count=len(upcoming),
        upcoming_schedules=[_build_schedule_read(s) for s in upcoming],
    )
