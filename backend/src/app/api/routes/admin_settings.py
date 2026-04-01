import json
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...models import SystemSettings, RoleEnum
from ...schemas import SystemSettingRead, SystemSettingUpdate, Message
from ...services.audit import write_audit_log
from ...utils.response_cache import TimedSingleFlightCache
from ...core.i18n import translate as _t
from ..deps import (
    DEFAULT_PERMISSION_ROWS,
    canonicalize_permission_rows,
    ensure_permission,
    get_db_dep,
    get_current_user,
    invalidate_permission_rows_cache,
    load_permission_rows,
    normalize_feature,
    permission_defaults_enabled,
    permission_allowed,
)

router = APIRouter()
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MAINTENANCE_MODES = {"off", "read-only", "down"}
PERMISSIONS_CONFIG_KEY = "permissions_config"
_maintenance_public_cache: TimedSingleFlightCache[dict[str, str]] = TimedSingleFlightCache(ttl_seconds=30.0)


def _allowed_features(rows, role: RoleEnum):
    role_key = role.value.lower()
    return [row["feature"] for row in rows if isinstance(row, dict) and row.get(role_key) is True and row.get("feature")]


def _ensure_admin_permission_floor(rows: list[dict]) -> None:
    required_features = {"Manage Roles", "System Settings"}
    for feature in required_features:
        if not any(
            isinstance(row, dict)
            and normalize_feature(row.get("feature")) == feature
            and row.get("admin") is True
            for row in rows
        ):
            raise HTTPException(status_code=400, detail=f"Admin must keep the '{feature}' permission")


def _normalize_permissions_config(raw_value: str | None) -> str:
    try:
        parsed = [] if not raw_value else json.loads(raw_value)
    except Exception:
        raise HTTPException(status_code=400, detail=_t("invalid_json_permissions"))
    if not isinstance(parsed, list):
        raise HTTPException(status_code=400, detail=_t("permissions_must_be_list"))
    normalized = []
    for row in parsed:
        if not isinstance(row, dict) or not str(row.get("feature") or "").strip():
            raise HTTPException(status_code=400, detail=_t("permissions_row_feature"))
        normalized.append({
            "feature": normalize_feature(str(row.get("feature")).strip()),
            "admin": bool(row.get("admin")),
            "instructor": bool(row.get("instructor")),
            "learner": bool(row.get("learner")),
        })
    canonical = canonicalize_permission_rows(normalized)
    _ensure_admin_permission_floor(canonical)
    return json.dumps(canonical)


def _role_permission_sets(raw_value: str | None) -> dict[str, set[str]]:
    try:
        parsed = [] if not raw_value else json.loads(raw_value)
    except Exception:
        parsed = []
    normalized = canonicalize_permission_rows(parsed)
    role_map = {
        RoleEnum.ADMIN.value: set(),
        RoleEnum.INSTRUCTOR.value: set(),
        RoleEnum.LEARNER.value: set(),
    }
    field_map = {
        RoleEnum.ADMIN.value: "admin",
        RoleEnum.INSTRUCTOR.value: "instructor",
        RoleEnum.LEARNER.value: "learner",
    }
    for row in normalized:
        feature = row.get("feature")
        if not feature:
            continue
        for role_name, field_name in field_map.items():
            if row.get(field_name) is True:
                role_map[role_name].add(feature)
    return role_map


def _write_role_permission_audit_logs(db: Session, current, previous_value: str | None, next_value: str | None) -> None:
    previous = _role_permission_sets(previous_value)
    current_sets = _role_permission_sets(next_value)
    for role_name in (RoleEnum.ADMIN.value, RoleEnum.INSTRUCTOR.value, RoleEnum.LEARNER.value):
        added = sorted(current_sets[role_name] - previous[role_name])
        removed = sorted(previous[role_name] - current_sets[role_name])
        if not added and not removed:
            continue
        detail_parts = [f"role={role_name}"]
        if added:
            detail_parts.append(f"added={', '.join(added)}")
        if removed:
            detail_parts.append(f"removed={', '.join(removed)}")
        write_audit_log(
            db,
            getattr(current, "id", None),
            action="ROLE_PERMISSIONS_UPDATED",
            resource_type="role",
            resource_id=role_name,
            detail="; ".join(detail_parts),
        )


def _ensure_setting_access(db: Session, current, key: str):
    if key == PERMISSIONS_CONFIG_KEY and permission_allowed(load_permission_rows(db), current.role, "Manage Roles"):
        return
    ensure_permission(db, current, "System Settings")


def _get_or_create_permissions_setting(db: Session):
    setting = db.scalar(select(SystemSettings).where(SystemSettings.key == PERMISSIONS_CONFIG_KEY))
    if setting:
        return setting
    if not permission_defaults_enabled():
        raise HTTPException(status_code=503, detail=_t("permissions_config_unavailable"))
    setting = SystemSettings(key=PERMISSIONS_CONFIG_KEY, value=json.dumps(DEFAULT_PERMISSION_ROWS))
    db.add(setting)
    db.commit()
    db.refresh(setting)
    return setting


def _normalize_integrations_config(raw_value: str | None) -> str:
    try:
        parsed = {} if not raw_value else json.loads(raw_value)
    except Exception:
        raise HTTPException(status_code=400, detail=_t("invalid_json_integrations"))
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail=_t("integrations_must_be_object"))

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
def list_settings(db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    rows = load_permission_rows(db)
    can_system_settings = permission_allowed(rows, current.role, "System Settings")
    can_manage_roles = permission_allowed(rows, current.role, "Manage Roles")
    if not can_system_settings and not can_manage_roles:
        raise HTTPException(status_code=403, detail=_t("insufficient_permissions"))
    if not can_system_settings:
        return [_get_or_create_permissions_setting(db)]
    return db.scalars(select(SystemSettings)).all()


@router.get("/{key}", response_model=SystemSettingRead)
def get_setting(key: str, db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    _ensure_setting_access(db, current, key)
    if key == PERMISSIONS_CONFIG_KEY:
        return _get_or_create_permissions_setting(db)
    setting = db.scalar(select(SystemSettings).where(SystemSettings.key == key))
    if not setting:
        raise HTTPException(status_code=404, detail=_t("setting_not_found"))
    return setting


@router.put("/{key}", response_model=SystemSettingRead)
def update_setting(key: str, body: SystemSettingUpdate, db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    _ensure_setting_access(db, current, key)
    if key == "integrations_config":
        body = SystemSettingUpdate(value=_normalize_integrations_config(body.value))
    elif key == "subscribers":
        try:
            parsed = [] if not body.value else json.loads(body.value)
        except Exception:
            raise HTTPException(status_code=400, detail=_t("invalid_json_subscribers"))
        if not isinstance(parsed, list):
            raise HTTPException(status_code=400, detail=_t("subscribers_must_be_list"))
        normalized = []
        seen = set()
        for raw in parsed:
            email = str(raw or "").strip().lower()
            if not email:
                continue
            if not EMAIL_RE.match(email):
                raise HTTPException(status_code=400, detail=_t("invalid_recipient_email", email=email))
            if email in seen:
                continue
            seen.add(email)
            normalized.append(email)
        body = SystemSettingUpdate(value=json.dumps(normalized))
    elif key == "allow_signup":
        normalized = str(body.value or "").strip().lower()
        if normalized not in {"true", "false", "1", "0", "yes", "no"}:
            raise HTTPException(status_code=400, detail=_t("allow_signup_bool"))
        body = SystemSettingUpdate(value="true" if normalized in {"true", "1", "yes"} else "false")
    elif key == "maintenance_mode":
        normalized = str(body.value or "").strip().lower()
        if normalized not in MAINTENANCE_MODES:
            raise HTTPException(status_code=400, detail=_t("invalid_maintenance_mode"))
        body = SystemSettingUpdate(value=normalized)
    elif key == PERMISSIONS_CONFIG_KEY:
        body = SystemSettingUpdate(value=_normalize_permissions_config(body.value))

    setting = db.scalar(select(SystemSettings).where(SystemSettings.key == key))
    previous_value = setting.value if setting else None
    if not setting:
        setting = SystemSettings(key=key, value=body.value)
        db.add(setting)
    else:
        setting.value = body.value
        db.add(setting)
    db.commit()
    db.refresh(setting)
    if key == PERMISSIONS_CONFIG_KEY:
        invalidate_permission_rows_cache(db)
    if key in {"maintenance_mode", "maintenance_banner"}:
        _maintenance_public_cache.invalidate()
    if key == PERMISSIONS_CONFIG_KEY and previous_value != setting.value:
        _write_role_permission_audit_logs(db, current, previous_value, setting.value)
    return setting


@router.get("/maintenance/public")
def maintenance_public(db: Session = Depends(get_db_dep)):
    def _load_maintenance_payload() -> dict[str, str]:
        mode = db.scalar(select(SystemSettings).where(SystemSettings.key == "maintenance_mode"))
        banner = db.scalar(select(SystemSettings).where(SystemSettings.key == "maintenance_banner"))
        if not mode and not permission_defaults_enabled():
            raise HTTPException(status_code=503, detail=_t("maintenance_config_unavailable"))
        return {
            "mode": mode.value if mode else "off",
            "banner": banner.value if banner else "",
        }

    return _maintenance_public_cache.get_or_compute("maintenance-public", _load_maintenance_payload)


@router.get("/permissions/public")
def permissions_public(db: Session = Depends(get_db_dep), current=Depends(get_current_user)):
    rows = load_permission_rows(db)
    return {
        "role": current.role.value,
        "permissions": rows,
        "allowed_features": _allowed_features(rows, current.role),
    }
