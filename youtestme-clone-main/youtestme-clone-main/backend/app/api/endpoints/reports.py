from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func
from sqlalchemy.future import select
from app.db.session import get_db
from app.models.models import User, Test, Attempt

router = APIRouter()

@router.get("/stats")
async def get_system_stats(db: AsyncSession = Depends(get_db)):
    # Fetch all counts in a single query using subqueries for better performance and reliability
    query = select(
        select(func.count(User.id)).scalar_subquery().label("users"),
        select(func.count(Test.id)).scalar_subquery().label("tests"),
        select(func.count(Attempt.id)).scalar_subquery().label("attempts"),
        select(func.count(Attempt.id)).where(Attempt.status == "completed").scalar_subquery().label("completed")
    )
    
    result = await db.execute(query)
    row = result.first()
    
    return {
        "users": row.users if row else 0,
        "tests": row.tests if row else 0,
        "attempts": row.attempts if row else 0,
        "completedAttempts": row.completed if row else 0
    }

