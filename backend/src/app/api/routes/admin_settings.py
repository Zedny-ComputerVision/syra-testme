from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...models import SystemSettings, RoleEnum
from ...schemas import SystemSettingRead, SystemSettingUpdate, Message
from ..deps import get_db_dep, require_role, get_current_user

router = APIRouter()


@router.get("/", response_model=list[SystemSettingRead])
async def list_settings(db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN))):
    return db.scalars(select(SystemSettings)).all()


@router.get("/{key}", response_model=SystemSettingRead)
async def get_setting(key: str, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN))):
    setting = db.scalar(select(SystemSettings).where(SystemSettings.key == key))
    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")
    return setting


@router.put("/{key}", response_model=SystemSettingRead)
async def update_setting(key: str, body: SystemSettingUpdate, db: Session = Depends(get_db_dep), current=Depends(require_role(RoleEnum.ADMIN))):
    # Basic validation for integrations_config JSON
    if key == "integrations_config":
        try:
            parsed = {} if not body.value else __import__("json").loads(body.value)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON for integrations_config")
        if not isinstance(parsed, dict):
            raise HTTPException(status_code=400, detail="integrations_config must be an object")
        for name, cfg in parsed.items():
            if not isinstance(cfg, dict):
                raise HTTPException(status_code=400, detail=f"Invalid config for {name}")
            if cfg.get("enabled") and not cfg.get("url"):
                raise HTTPException(status_code=400, detail=f"{name} requires a URL when enabled")

    setting = db.scalar(select(SystemSettings).where(SystemSettings.key == key))
    if not setting:
        setting = SystemSettings(key=key, value=body.value)
        db.add(setting)
    else:
        setting.value = body.value
        db.add(setting)
    db.commit()
    db.refresh(setting)
    return setting


@router.get("/maintenance/public")
async def maintenance_public(db: Session = Depends(get_db_dep)):
    mode = db.scalar(select(SystemSettings).where(SystemSettings.key == "maintenance_mode"))
    banner = db.scalar(select(SystemSettings).where(SystemSettings.key == "maintenance_banner"))
    return {
        "mode": mode.value if mode else "off",
        "banner": banner.value if banner else "",
    }
