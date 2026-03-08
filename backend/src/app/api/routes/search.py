from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...models import Attempt, Exam, ExamStatus, RoleEnum, User
from ..deps import get_current_user, get_db_dep, learner_can_access_exam, load_permission_rows, permission_allowed

router = APIRouter()


def _is_pool_library_exam(exam: Exam) -> bool:
    settings = exam.settings if isinstance(exam.settings, dict) else {}
    return bool(settings.get("_pool_library"))


@router.get("/")
async def search(q: str, db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    query = q.strip().lower()
    rows = load_permission_rows(db)
    can_edit_tests = permission_allowed(rows, current.role, "Edit Tests")
    can_view_attempt_analysis = permission_allowed(rows, current.role, "View Attempt Analysis")
    can_manage_users = permission_allowed(rows, current.role, "Manage Users")

    exams = []
    if current.role == RoleEnum.LEARNER:
        exam_query = select(Exam).where(
            Exam.title.ilike(f"%{query}%"),
            Exam.status == ExamStatus.OPEN,
        )
        exams = [
            exam
            for exam in db.scalars(exam_query).all()
            if not _is_pool_library_exam(exam) and learner_can_access_exam(db, exam, current)
        ]
    elif can_edit_tests:
        exam_query = select(Exam).where(Exam.title.ilike(f"%{query}%"))
        exams = [exam for exam in db.scalars(exam_query).all() if not _is_pool_library_exam(exam)]

    if current.role in {RoleEnum.ADMIN, RoleEnum.INSTRUCTOR} and can_view_attempt_analysis:
        attempts = db.scalars(select(Attempt).where(Attempt.status.isnot(None))).all()
    else:
        attempts = db.scalars(select(Attempt).where(Attempt.user_id == current.id)).all()
    attempts = [a for a in attempts if (a.exam and query in (a.exam.title or "").lower()) or (a.user and query in (a.user.name or "").lower())]

    users = []
    if current.role in {RoleEnum.ADMIN, RoleEnum.INSTRUCTOR} and can_manage_users:
        users = db.scalars(select(User).where((User.name.ilike(f"%{query}%")) | (User.email.ilike(f"%{query}%")) | (User.user_id.ilike(f"%{query}%")))).all()

    return {
        "exams": [{"id": e.id, "title": e.title, "status": e.status} for e in exams],
        "attempts": [
            {
                "id": a.id,
                "test_title": a.exam.title if a.exam else None,
                "exam_title": a.exam.title if a.exam else None,
                "user_name": a.user.name if a.user else None,
            }
            for a in attempts
        ],
        "users": [{"id": u.id, "name": u.name, "email": u.email, "user_id": u.user_id} for u in users],
    }
