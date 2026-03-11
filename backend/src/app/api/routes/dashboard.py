from fastapi import APIRouter, Depends

from ...schemas import DashboardRead
from ...services.dashboard_service import build_dashboard
from ..deps import get_current_user, get_db_dep

router = APIRouter()


@router.get("/", response_model=DashboardRead)
async def dashboard(db=Depends(get_db_dep), current=Depends(get_current_user)):
    return build_dashboard(db=db, current=current)
