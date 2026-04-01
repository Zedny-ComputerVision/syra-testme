from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ...core.i18n import translate as _t
from ...api.deps import get_db_dep, require_permission
from ...models import RoleEnum
from ...services.integrations import dispatch_integrations
from ...core.config import get_settings
import time

router = APIRouter()
settings = get_settings()


@router.post("/test")
async def test_integrations(config: dict, db: Session = Depends(get_db_dep), current=Depends(require_permission("System Settings", RoleEnum.ADMIN))):
    event = {
        "event_type": "TEST",
        "detail": "Integration test ping",
        "source": "admin",
        "timestamp": time.time(),
    }
    results = await dispatch_integrations(event, config or {})
    if not results:
        raise HTTPException(status_code=400, detail=_t("no_integrations_enabled"))
    return {"results": results}
