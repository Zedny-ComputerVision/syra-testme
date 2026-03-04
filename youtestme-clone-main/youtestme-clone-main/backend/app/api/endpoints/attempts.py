from fastapi import APIRouter, Depends, HTTPException, status, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List, Dict
from datetime import datetime
from app.db.session import get_db
from app.models.models import Attempt, Question
from app.schemas.schemas import AttemptCreate, AttemptResponse, QuestionResponse

router = APIRouter()

@router.post("/", response_model=AttemptResponse, status_code=status.HTTP_201_CREATED)
@router.post("/start", response_model=AttemptResponse, status_code=status.HTTP_201_CREATED)
async def start_attempt(attempt_in: AttemptCreate, db: AsyncSession = Depends(get_db)):
    db_attempt = Attempt(
        test_id=attempt_in.test_id,
        user_id=attempt_in.user_id,
        session_id=attempt_in.session_id,
        status="in_progress",
        started_at=datetime.utcnow()
    )
    db.add(db_attempt)
    await db.commit()
    await db.refresh(db_attempt)
    return db_attempt

@router.post("/{attempt_id}/submit", response_model=AttemptResponse)
async def submit_attempt(
    attempt_id: int, 
    answers: Dict[int, int] = Body(...), # question_id -> option_index
    db: AsyncSession = Depends(get_db)
):
    # Get attempt
    result = await db.execute(select(Attempt).where(Attempt.id == attempt_id))
    attempt = result.scalars().first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    
    if attempt.status == "completed":
        raise HTTPException(status_code=400, detail="Attempt already completed")
    
    # Get questions
    result = await db.execute(select(Question).where(Question.test_id == attempt.test_id))
    questions = result.scalars().all()
    
    score = 0
    # The original keys were numbers (question IDs), but in JSON they might be strings. 
    # FastAPI/Pydantic Dict[int, int] should handle string-to-int conversion.
    
    for q in questions:
        # Check if question ID exists in answers
        if q.id in answers:
            if answers[q.id] == q.correct_option:
                score += q.points
    
    # Update attempt
    attempt.ended_at = datetime.utcnow()
    attempt.score = score
    attempt.status = "completed"
    
    await db.commit()
    await db.refresh(attempt)
    return attempt

@router.get("/{attempt_id}/questions", response_model=List[dict])
async def get_attempt_questions(attempt_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Attempt).where(Attempt.id == attempt_id))
    attempt = result.scalars().first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    
    # Fetch questions but EXCLUDE correct_option
    result = await db.execute(
        select(Question.id, Question.test_id, Question.text, Question.options, Question.points)
        .where(Question.test_id == attempt.test_id)
        .order_by(Question.id.asc())
    )
    # Convert Row objects to dicts
    questions = [dict(row._mapping) for row in result]
    return questions

@router.get("/{attempt_id}/report", response_model=AttemptResponse)
async def get_attempt_report(attempt_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Attempt).where(Attempt.id == attempt_id))
    attempt = result.scalars().first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    return attempt

