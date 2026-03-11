from fastapi import APIRouter, Depends

from ...services.testing_seed_service import reset_seed as reset_seed_service
from ..deps import get_db_dep

router = APIRouter()


@router.post("/testing/reset-seed")
def reset_seed(db=Depends(get_db_dep)):
    return reset_seed_service(db)
