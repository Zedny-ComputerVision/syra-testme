from fastapi import APIRouter

from ...modules.users.routes_admin import router as admin_router
from ...modules.users.routes_public import router as public_router


router = APIRouter()
router.include_router(public_router)
router.include_router(admin_router)
