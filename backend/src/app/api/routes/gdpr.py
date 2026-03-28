from fastapi import APIRouter, Depends

from ...services.gdpr_service import export_user_data as export_user_data_service
from ..deps import get_current_user, get_db_dep

router = APIRouter()


@router.post("/users/{user_id}/export-data")
def export_user_data(
    user_id: str,
    db=Depends(get_db_dep),
    current=Depends(get_current_user),
):
    return export_user_data_service(db=db, current=current, user_id=user_id)
