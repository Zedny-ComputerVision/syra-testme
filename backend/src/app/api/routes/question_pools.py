import random

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from ...models import QuestionPool, Question, Exam, RoleEnum
from ...schemas import Message, QuestionPoolCreate, QuestionPoolRead, QuestionRead
from ..deps import get_current_user, get_db_dep, require_role

router = APIRouter()


@router.post("/", response_model=QuestionPoolRead)
async def create_pool(
    body: QuestionPoolCreate,
    db: Session = Depends(get_db_dep),
    current=Depends(require_role(RoleEnum.ADMIN, RoleEnum.INSTRUCTOR)),
):
    now = datetime.now(timezone.utc)
    pool = QuestionPool(
        name=body.name,
        description=body.description,
        created_by_id=current.id,
        created_at=now,
        updated_at=now,
    )
    db.add(pool)
    db.commit()
    db.refresh(pool)
    return pool


@router.get("/", response_model=list[QuestionPoolRead])
async def list_pools(db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    return db.scalars(select(QuestionPool)).all()


@router.get("/{pool_id}", response_model=QuestionPoolRead)
async def get_pool(pool_id: str, db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    pool = db.get(QuestionPool, pool_id)
    if not pool:
        raise HTTPException(status_code=404, detail="Not found")
    return pool


@router.get("/{pool_id}/questions", response_model=list[QuestionRead])
async def list_pool_questions(pool_id: str, db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    pool = db.get(QuestionPool, pool_id)
    if not pool:
        raise HTTPException(status_code=404, detail="Pool not found")
    return db.scalars(select(Question).where(Question.pool_id == pool_id)).all()


@router.post("/{pool_id}/seed-exam/{exam_id}", response_model=Message)
async def seed_exam_from_pool(
    pool_id: str,
    exam_id: str,
    count: int = 5,
    db: Session = Depends(get_db_dep),
    current=Depends(require_role(RoleEnum.ADMIN, RoleEnum.INSTRUCTOR)),
):
    pool = db.get(QuestionPool, pool_id)
    if not pool:
        raise HTTPException(status_code=404, detail="Pool not found")
    exam = db.get(Exam, exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    if current.role == RoleEnum.INSTRUCTOR and exam.created_by_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")
    pool_questions = db.scalars(select(Question).where(Question.pool_id == pool_id)).all()
    if not pool_questions:
        raise HTTPException(status_code=400, detail="Pool has no questions")
    existing_max = db.scalar(
        select(func.max(Question.order)).where(Question.exam_id == exam_id)
    ) or 0
    selected = random.sample(pool_questions, min(count, len(pool_questions)))
    for i, pq in enumerate(selected):
        q = Question(
            exam_id=exam_id, text=pq.text, type=pq.type, options=pq.options,
            correct_answer=pq.correct_answer, points=pq.points,
            order=existing_max + i + 1, pool_id=pool_id,
        )
        db.add(q)
    db.commit()
    return Message(detail=f"Seeded {len(selected)} questions")


@router.delete("/{pool_id}", response_model=Message)
async def delete_pool(pool_id: str, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN, RoleEnum.INSTRUCTOR))):
    pool = db.get(QuestionPool, pool_id)
    if not pool:
        raise HTTPException(status_code=404, detail="Not found")
    if current.role == RoleEnum.INSTRUCTOR and pool.created_by_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")
    db.delete(pool)
    db.commit()
    return Message(detail="Deleted")
