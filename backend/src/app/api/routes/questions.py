from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...models import Question, Exam, ExamStatus, RoleEnum
from ...schemas import QuestionCreate, QuestionRead, QuestionBase, Message
from ...services.sanitization import sanitize_question_payload
from ..deps import ensure_exam_owner, ensure_permission, get_current_user, get_db_dep, learner_can_access_exam, require_permission

router = APIRouter()


def _parse_uuid(value: str, detail: str) -> str:
    try:
        return str(UUID(value))
    except (TypeError, ValueError):
        raise HTTPException(status_code=404, detail=detail)


def _learner_question_response(question: Question) -> dict:
    masked = QuestionRead.model_validate(question, from_attributes=True).model_copy(
        update={"correct_answer": None}
    )
    return jsonable_encoder(masked, by_alias=True)


@router.post("/", response_model=QuestionRead)
def create_question(body: QuestionCreate, db: Session = Depends(get_db_dep), current=Depends(require_permission("Edit Tests", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    exam = db.get(Exam, body.exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Test not found")
    ensure_exam_owner(exam, current, detail="Not allowed", status_code=403)
    if exam.status == ExamStatus.OPEN:
        raise HTTPException(status_code=409, detail="Cannot add questions to a published test")
    now = datetime.now(timezone.utc)
    q = Question(**sanitize_question_payload(body.model_dump()), created_at=now, updated_at=now)
    db.add(q)
    db.commit()
    db.refresh(q)
    return q


@router.get("/", response_model=list[QuestionRead])
def list_questions(exam_id: str | None = None, db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    if current.role != RoleEnum.LEARNER:
        ensure_permission(db, current, "Edit Tests")
    elif not exam_id:
        raise HTTPException(status_code=403, detail="exam_id is required")

    query = select(Question)
    if exam_id:
        try:
            parsed_exam_id = str(UUID(exam_id))
        except (TypeError, ValueError):
            raise HTTPException(status_code=422, detail="Invalid exam_id")
        if current.role == RoleEnum.LEARNER:
            exam = db.get(Exam, parsed_exam_id)
            if not learner_can_access_exam(db, exam, current):
                raise HTTPException(status_code=404, detail="Test not found")
        else:
            exam = db.get(Exam, parsed_exam_id)
            if not exam:
                raise HTTPException(status_code=404, detail="Test not found")
            ensure_exam_owner(exam, current)
        query = query.where(Question.exam_id == parsed_exam_id)
    elif current.role in {RoleEnum.ADMIN, RoleEnum.INSTRUCTOR}:
        query = query.join(Question.exam).where(Exam.created_by_id == current.id)
    questions = db.scalars(query.order_by(Question.order.asc(), Question.created_at.asc())).all()
    if current.role == RoleEnum.LEARNER:
        return JSONResponse(content=[_learner_question_response(q) for q in questions])
    return questions


@router.get("/{question_id}", response_model=QuestionRead)
def get_question(
    question_id: str,
    db: Session = Depends(get_db_dep),
    current=Depends(get_current_user),
):
    if current.role != RoleEnum.LEARNER:
        ensure_permission(db, current, "Edit Tests")
    parsed_id = _parse_uuid(question_id, "Question not found")
    q = db.get(Question, parsed_id)
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    if current.role == RoleEnum.LEARNER:
        return JSONResponse(content=_learner_question_response(q))
    ensure_exam_owner(q.exam, current)
    return q


@router.put("/{question_id}", response_model=QuestionRead)
def update_question(question_id: str, body: QuestionBase, db: Session = Depends(get_db_dep), current=Depends(require_permission("Edit Tests", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    parsed_id = _parse_uuid(question_id, "Question not found")
    q = db.get(Question, parsed_id)
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    ensure_exam_owner(q.exam, current, detail="Not allowed", status_code=403)
    if q.exam and q.exam.status == ExamStatus.OPEN:
        raise HTTPException(status_code=409, detail="Cannot modify questions on a published test")
    protected = {"exam_id", "created_at"}
    now = datetime.now(timezone.utc)
    for field, value in sanitize_question_payload(body.model_dump()).items():
        if field not in protected:
            setattr(q, field, value)
    q.updated_at = now
    db.add(q)
    db.commit()
    db.refresh(q)
    return q


@router.delete("/{question_id}", response_model=Message)
def delete_question(question_id: str, db: Session = Depends(get_db_dep), current=Depends(require_permission("Edit Tests", RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    parsed_id = _parse_uuid(question_id, "Question not found")
    q = db.get(Question, parsed_id)
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    ensure_exam_owner(q.exam, current, detail="Not allowed", status_code=403)
    if q.exam and q.exam.status == ExamStatus.OPEN:
        raise HTTPException(status_code=409, detail="Cannot delete questions on a published test")
    db.delete(q)
    db.commit()
    return Message(detail="Deleted")
