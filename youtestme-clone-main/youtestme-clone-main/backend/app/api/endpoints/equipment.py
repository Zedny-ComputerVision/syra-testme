from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List
from app.db.session import get_db
from app.models.models import EquipmentCheck
from app.schemas.schemas import EquipmentCheckCreate, EquipmentCheckResponse

router = APIRouter()

@router.post("/", response_model=EquipmentCheckResponse, status_code=status.HTTP_201_CREATED)
async def save_equipment_check(check_in: EquipmentCheckCreate, db: AsyncSession = Depends(get_db)):
    db_check = EquipmentCheck(**check_in.model_dump())
    db.add(db_check)
    await db.commit()
    await db.refresh(db_check)
    return db_check

@router.get("/{user_id}", response_model=List[EquipmentCheckResponse])
async def get_equipment_checks(user_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(EquipmentCheck)
        .where(EquipmentCheck.user_id == user_id)
        .order_by(EquipmentCheck.timestamp.desc())
    )
    return result.scalars().all()

