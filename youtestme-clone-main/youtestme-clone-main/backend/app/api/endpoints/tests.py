from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List
from app.db.session import get_db
from app.models.models import Test, Question
from app.schemas.schemas import TestCreate, TestResponse, QuestionCreate, QuestionResponse

router = APIRouter()

@router.get("/", response_model=List[TestResponse])
async def get_tests(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Test).order_by(Test.created_at.desc()))
    return result.scalars().all()

@router.get("/{test_id}", response_model=TestResponse)
async def get_test(test_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Test).where(Test.id == test_id))
    test = result.scalars().first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    return test

@router.post("/", response_model=TestResponse, status_code=status.HTTP_201_CREATED)
async def create_test(test_in: TestCreate, db: AsyncSession = Depends(get_db)):
    test_data = test_in.model_dump()
    # Remove creation_type if it exists in data but not in model
    if "creation_type" in test_data:
        del test_data["creation_type"]
        
    db_test = Test(**test_data)
    db.add(db_test)
    await db.commit()
    await db.refresh(db_test)
    return db_test

@router.post("/questions", response_model=QuestionResponse, status_code=status.HTTP_201_CREATED)
async def add_question(question_in: QuestionCreate, db: AsyncSession = Depends(get_db)):
    db_question = Question(**question_in.model_dump())
    db.add(db_question)
    await db.commit()
    await db.refresh(db_question)
    return db_question

@router.get("/{test_id}/questions", response_model=List[QuestionResponse])
async def get_test_questions(test_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Question).where(Question.test_id == test_id).order_by(Question.id.asc()))
    return result.scalars().all()
