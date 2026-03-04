from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...models import Question, Exam, RoleEnum
from ...schemas import QuestionCreate, QuestionRead, QuestionBase, Message
from ..deps import get_current_user, get_db_dep, require_role

router = APIRouter()


@router.post("/", response_model=QuestionRead)
async def create_question(body: QuestionCreate, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    exam = db.get(Exam, body.exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    if current.role == RoleEnum.INSTRUCTOR and exam.created_by_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")
    now = datetime.now(timezone.utc)
    q = Question(**body.model_dump(), created_at=now, updated_at=now)
    db.add(q)
    db.commit()
    db.refresh(q)
    return q


@router.get("/", response_model=list[QuestionRead])
async def list_questions(exam_id: str | None = None, db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    query = select(Question)
    if exam_id:
        query = query.where(Question.exam_id == exam_id)
    questions = db.scalars(query).all()
    return questions


@router.put("/{question_id}", response_model=QuestionRead)
async def update_question(question_id: str, body: QuestionBase, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    q = db.get(Question, question_id)
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    if current.role == RoleEnum.INSTRUCTOR and q.exam.created_by_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")
    for field, value in body.model_dump().items():
        setattr(q, field, value)
    db.add(q)
    db.commit()
    db.refresh(q)
    return q


@router.delete("/{question_id}", response_model=Message)
async def delete_question(question_id: str, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    q = db.get(Question, question_id)
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    if current.role == RoleEnum.INSTRUCTOR and q.exam.created_by_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")
    db.delete(q)
    db.commit()
    return Message(detail="Deleted")
