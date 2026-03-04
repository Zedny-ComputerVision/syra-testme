from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...models import Exam, Attempt, User, RoleEnum
from ..deps import get_current_user, get_db_dep

router = APIRouter()


@router.get("/")
async def search(q: str, db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    query = q.strip().lower()
    exams = db.scalars(select(Exam).where(Exam.title.ilike(f"%{query}%"))).all()

    if current.role in {RoleEnum.ADMIN, RoleEnum.INSTRUCTOR}:
        attempts = db.scalars(select(Attempt).where(Attempt.status.isnot(None))).all()
    else:
        attempts = db.scalars(select(Attempt).where(Attempt.user_id == current.id)).all()
    attempts = [a for a in attempts if (a.exam and query in (a.exam.title or "").lower()) or (a.user and query in (a.user.name or "").lower())]

    users = []
    if current.role in {RoleEnum.ADMIN, RoleEnum.INSTRUCTOR}:
        users = db.scalars(select(User).where((User.name.ilike(f"%{query}%")) | (User.email.ilike(f"%{query}%")) | (User.user_id.ilike(f"%{query}%")))).all()

    return {
        "exams": [{"id": e.id, "title": e.title, "status": e.status} for e in exams],
        "attempts": [{"id": a.id, "exam_title": a.exam.title if a.exam else None, "user_name": a.user.name if a.user else None} for a in attempts],
        "users": [{"id": u.id, "name": u.name, "email": u.email, "user_id": u.user_id} for u in users],
    }
