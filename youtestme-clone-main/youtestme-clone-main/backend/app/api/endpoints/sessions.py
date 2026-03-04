from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List
from app.db.session import get_db
from app.models.models import Session
from app.schemas.schemas import SessionCreate, SessionResponse

router = APIRouter()

@router.get("/{test_id}", response_model=List[SessionResponse])
async def get_sessions(test_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Session).where(Session.test_id == test_id).order_by(Session.available_from.asc()))
    return result.scalars().all()

@router.post("/", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(session_in: SessionCreate, db: AsyncSession = Depends(get_db)):
    db_session = Session(**session_in.model_dump())
    db.add(db_session)
    await db.commit()
    await db.refresh(db_session)
    return db_session
