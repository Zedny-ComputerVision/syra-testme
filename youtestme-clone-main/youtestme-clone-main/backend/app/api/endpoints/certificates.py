from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import join
from app.db.session import get_db
from app.models.models import Attempt, User, Test
from app.services.certificate import generate_certificate_pdf

router = APIRouter()

@router.get("/download/{attempt_id}")
async def download_certificate(attempt_id: int, db: AsyncSession = Depends(get_db)):
    # Get attempt details JOIN users and tests
    # SELECT u.name as user_name, t.name as test_name, a.ended_at 
    # FROM attempts a JOIN users u ON a.user_id = u.id JOIN tests t ON a.test_id = t.id
    # WHERE a.id = $1 AND a.status = 'completed'
    
    query = (
        select(User.name.label("user_name"), Test.name.label("test_name"), Attempt.ended_at)
        .select_from(join(Attempt, User, Attempt.user_id == User.id).join(Test, Attempt.test_id == Test.id))
        .where(Attempt.id == attempt_id, Attempt.status == "completed")
    )
    
    result = await db.execute(query)
    row = result.first()
    
    if not row:
        raise HTTPException(status_code=404, detail="Certificate not found or exam not completed")
    
    date_str = row.ended_at.strftime("%m/%d/%Y") if row.ended_at else "N/A"
    
    pdf_content = await generate_certificate_pdf(row.user_name, row.test_name, date_str)
    
    return Response(
        content=pdf_content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=certificate-{attempt_id}.pdf"
        }
    )

