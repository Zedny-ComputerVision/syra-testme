from fastapi import APIRouter, Depends

from ...models import RoleEnum
from ...services.testing_seed_service import reset_seed as reset_seed_service
from ..deps import get_db_dep, require_permission

router = APIRouter()


@router.post("/testing/reset-seed")
def reset_seed(
    db=Depends(get_db_dep),
    current=Depends(require_permission("system.admin", RoleEnum.ADMIN)),
):
    return reset_seed_service(db)
