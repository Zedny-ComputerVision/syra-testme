import json
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...models import SystemSettings, RoleEnum
from ...schemas import SystemSettingRead, SystemSettingUpdate, Message
from ..deps import (
    DEFAULT_PERMISSION_ROWS,
    canonicalize_permission_rows,
    ensure_permission,
    get_db_dep,
    get_current_user,
    load_permission_rows,
    normalize_feature,
    permission_allowed,
)

router = APIRouter()
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MAINTENANCE_MODES = {"off", "read-only", "down"}
PERMISSIONS_CONFIG_KEY = "permissions_config"


def _allowed_features(rows, role: RoleEnum):
    role_key = role.value.lower()
    return [row["feature"] for row in rows if isinstance(row, dict) and row.get(role_key) is True and row.get("feature")]


def _normalize_permissions_config(raw_value: str | None) -> str:
    try:
        parsed = DEFAULT_PERMISSION_ROWS if not raw_value else json.loads(raw_value)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON for permissions_config")
    if not isinstance(parsed, list):
        raise HTTPException(status_code=400, detail="permissions_config must be a list")
    normalized = []
    for row in parsed:
        if not isinstance(row, dict) or not str(row.get("feature") or "").strip():
            raise HTTPException(status_code=400, detail="Each permissions_config row must include a feature")
        normalized.append({
            "feature": normalize_feature(str(row.get("feature")).strip()),
            "admin": bool(row.get("admin")),
            "instructor": bool(row.get("instructor")),
            "learner": bool(row.get("learner")),
        })
    return json.dumps(canonicalize_permission_rows(normalized))


def _ensure_setting_access(db: Session, current, key: str):
    if key == PERMISSIONS_CONFIG_KEY and permission_allowed(load_permission_rows(db), current.role, "Manage Roles"):
        return
    ensure_permission(db, current, "System Settings")


def _get_or_create_permissions_setting(db: Session):
    setting = db.scalar(select(SystemSettings).where(SystemSettings.key == PERMISSIONS_CONFIG_KEY))
    if setting:
        return setting
    setting = SystemSettings(key=PERMISSIONS_CONFIG_KEY, value=json.dumps(DEFAULT_PERMISSION_ROWS))
    db.add(setting)
    db.commit()
    db.refresh(setting)
    return setting


def _normalize_integrations_config(raw_value: str | None) -> str:
    try:
        parsed = {} if not raw_value else json.loads(raw_value)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON for integrations_config")
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail="integrations_config must be an object")

    normalized = {}
    for name, cfg in parsed.items():
        if not isinstance(cfg, dict):
            raise HTTPException(status_code=400, detail=f"Invalid config for {name}")
        clean_cfg = {}
        for cfg_key, cfg_value in cfg.items():
            if isinstance(cfg_value, str):
                clean_cfg[cfg_key] = cfg_value.strip()
            else:
                clean_cfg[cfg_key] = cfg_value
        if clean_cfg.get("enabled"):
            url = str(clean_cfg.get("url") or "")
            if not url:
                raise HTTPException(status_code=400, detail=f"{name} requires a URL when enabled")
            if not (url.startswith("http://") or url.startswith("https://")):
                raise HTTPException(status_code=400, detail=f"{name} url must start with http:// or https://")
        normalized[str(name).strip()] = clean_cfg
    return json.dumps(normalized)


@router.get("/", response_model=list[SystemSettingRead])
async def list_settings(db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    rows = load_permission_rows(db)
    can_system_settings = permission_allowed(rows, current.role, "System Settings")
    can_manage_roles = permission_allowed(rows, current.role, "Manage Roles")
    if not can_system_settings and not can_manage_roles:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    if not can_system_settings:
        return [_get_or_create_permissions_setting(db)]
    return db.scalars(select(SystemSettings)).all()


@router.get("/{key}", response_model=SystemSettingRead)
async def get_setting(key: str, db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    _ensure_setting_access(db, current, key)
    if key == PERMISSIONS_CONFIG_KEY:
        return _get_or_create_permissions_setting(db)
    setting = db.scalar(select(SystemSettings).where(SystemSettings.key == key))
    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")
    return setting


@router.put("/{key}", response_model=SystemSettingRead)
async def update_setting(key: str, body: SystemSettingUpdate, db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    _ensure_setting_access(db, current, key)
    if key == "integrations_config":
        body = SystemSettingUpdate(value=_normalize_integrations_config(body.value))
    elif key == "subscribers":
        try:
            parsed = [] if not body.value else __import__("json").loads(body.value)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON for subscribers")
        if not isinstance(parsed, list):
            raise HTTPException(status_code=400, detail="subscribers must be a list")
        normalized = []
        seen = set()
        for raw in parsed:
            email = str(raw or "").strip().lower()
            if not email:
                continue
            if not EMAIL_RE.match(email):
                raise HTTPException(status_code=400, detail=f"Invalid subscriber email: {email}")
            if email in seen:
                continue
            seen.add(email)
            normalized.append(email)
        body = SystemSettingUpdate(value=json.dumps(normalized))
    elif key == "allow_signup":
        normalized = str(body.value or "").strip().lower()
        if normalized not in {"true", "false", "1", "0", "yes", "no"}:
            raise HTTPException(status_code=400, detail="allow_signup must be true or false")
        body = SystemSettingUpdate(value="true" if normalized in {"true", "1", "yes"} else "false")
    elif key == "maintenance_mode":
        normalized = str(body.value or "").strip().lower()
        if normalized not in MAINTENANCE_MODES:
            raise HTTPException(status_code=400, detail="Invalid maintenance mode")
        body = SystemSettingUpdate(value=normalized)
    elif key == PERMISSIONS_CONFIG_KEY:
        body = SystemSettingUpdate(value=_normalize_permissions_config(body.value))

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


@router.get("/permissions/public")
async def permissions_public(db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    rows = load_permission_rows(db)
    return {
        "role": current.role.value,
        "permissions": rows,
        "allowed_features": _allowed_features(rows, current.role),
    }
