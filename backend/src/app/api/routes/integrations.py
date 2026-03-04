from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ...api.deps import require_role, get_db_dep
from ...models import RoleEnum
from ...services.integrations import dispatch_integrations
from ...core.config import get_settings
import time

router = APIRouter()
settings = get_settings()


@router.post("/test")
async def test_integrations(config: dict, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN))):
    event = {
        "event_type": "TEST",
        "detail": "Integration test ping",
        "source": "admin",
        "timestamp": time.time(),
    }
    results = await dispatch_integrations(event, config or {})
    if not results:
        raise HTTPException(status_code=400, detail="No integrations enabled or configured")
    return {"results": results}
