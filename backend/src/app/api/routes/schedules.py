from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...models import Schedule, RoleEnum
from ...schemas import ScheduleBase, ScheduleRead, Message
from ..deps import get_current_user, get_db_dep, require_role

router = APIRouter()


def _build(schedule: Schedule) -> ScheduleRead:
    exam = schedule.exam
    return ScheduleRead(
        id=schedule.id,
        exam_id=schedule.exam_id,
        user_id=schedule.user_id,
        scheduled_at=schedule.scheduled_at,
        access_mode=schedule.access_mode,
        notes=schedule.notes,
        created_at=schedule.created_at,
        updated_at=schedule.updated_at,
        exam_title=exam.title if exam else None,
        exam_type=exam.type if exam else None,
        exam_time_limit=exam.time_limit if exam else None,
    )


@router.post("/", response_model=ScheduleRead)
async def create_schedule(body: ScheduleBase, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    existing = db.scalar(select(Schedule).where(Schedule.user_id == body.user_id, Schedule.exam_id == body.exam_id))
    if existing:
        raise HTTPException(status_code=409, detail="Schedule already exists")
    now = datetime.now(timezone.utc)
    s = Schedule(**body.model_dump(), created_at=now, updated_at=now)
    db.add(s)
    db.commit()
    db.refresh(s)
    return _build(s)


@router.get("/", response_model=list[ScheduleRead])
async def list_schedules(db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    query = select(Schedule)
    if current.role == RoleEnum.LEARNER:
        query = query.where(Schedule.user_id == current.id)
    schedules = db.scalars(query).all()
    return [_build(s) for s in schedules]


@router.delete("/{schedule_id}", response_model=Message)
async def delete_schedule(schedule_id: str, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    s = db.get(Schedule, schedule_id)
    if not s:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(s)
    db.commit()
    return Message(detail="Deleted")
