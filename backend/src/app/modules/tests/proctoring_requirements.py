from collections.abc import Mapping
from typing import Any

_TRUTHY = {"1", "true", "yes", "y", "on", "enabled", "required"}
_FALSY = {"0", "false", "no", "n", "off", "disabled"}
_ALERT_RULE_ACTIONS = {"FLAG_REVIEW", "WARN", "AUTO_SUBMIT"}
_ALERT_RULE_SEVERITIES = {"LOW", "MEDIUM", "HIGH"}


def _coerce_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        raw = value.strip().lower()
        if raw in _TRUTHY:
            return True
        if raw in _FALSY:
            return False
    return default


def _read_optional_flag(config: Mapping[str, Any], *keys: str) -> bool | None:
    for key in keys:
        if key in config:
            return _coerce_bool(config.get(key), default=False)
    return None


def _coerce_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _normalize_alert_rule(rule: Mapping[str, Any], index: int) -> dict[str, Any] | None:
    event_type = str(rule.get("event_type") or rule.get("eventType") or "").strip().upper()
    threshold = max(1, _coerce_int(rule.get("threshold", rule.get("count")), 0))
    if not event_type or threshold < 1:
        return None

    action = str(rule.get("action") or "WARN").strip().upper()
    severity = str(rule.get("severity") or "MEDIUM").strip().upper()
    safe_action = action if action in _ALERT_RULE_ACTIONS else "WARN"
    safe_severity = severity if severity in _ALERT_RULE_SEVERITIES else "MEDIUM"
    message = rule.get("message")
    fallback_id = f"{event_type}-{threshold}-{safe_action}-{index + 1}".lower()
    return {
        "id": str(rule.get("id") or fallback_id),
        "event_type": event_type,
        "threshold": threshold,
        "severity": safe_severity,
        "action": safe_action,
        "message": str(message).strip() if isinstance(message, str) else "",
    }


def normalize_alert_rules(rules: Any) -> list[dict[str, Any]]:
    if not isinstance(rules, list):
        return []
    normalized: list[dict[str, Any]] = []
    for index, rule in enumerate(rules):
        if not isinstance(rule, Mapping):
            continue
        cleaned = _normalize_alert_rule(rule, index)
        if cleaned:
            normalized.append(cleaned)
    return normalized


def get_proctoring_requirements(proctoring_config: Mapping[str, Any] | None) -> dict[str, bool]:
    cfg: Mapping[str, Any] = proctoring_config or {}

    camera_required = _read_optional_flag(cfg, "camera_required", "require_camera", "camera_enforce")
    mic_required = _read_optional_flag(cfg, "mic_required", "microphone_required", "require_microphone")
    fullscreen_required = _read_optional_flag(cfg, "fullscreen_enforce", "fullscreen_required", "require_fullscreen")
    lighting_required = _read_optional_flag(cfg, "lighting_required", "require_lighting_check")
    screen_required = _read_optional_flag(cfg, "screen_capture", "screen_required", "require_screen_share")

    face_detection = _read_optional_flag(cfg, "face_detection", "multi_face")
    audio_detection = _read_optional_flag(cfg, "audio_detection")
    explicit_identity_required = _read_optional_flag(
        cfg,
        "identity_required",
        "id_verification_required",
        "require_identity_verification",
        "require_id_verification",
        "face_verify",
        "face_verify_enabled",
        "require_id_document",
        "id_document_required",
    )

    if camera_required is None:
        camera_required = bool(face_detection) if face_detection is not None else False
    if mic_required is None:
        mic_required = bool(audio_detection) if audio_detection is not None else False
    if fullscreen_required is None:
        fullscreen_required = False
    if lighting_required is None:
        lighting_required = bool(camera_required)
    if explicit_identity_required is None:
        explicit_identity_required = bool(face_detection)

    identity_required = bool(explicit_identity_required)
    system_check_required = bool(
        camera_required
        or mic_required
        or fullscreen_required
        or lighting_required
        or screen_required
    )

    return {
        "identity_required": identity_required,
        "system_check_required": system_check_required,
        "camera_required": bool(camera_required),
        "mic_required": bool(mic_required),
        "fullscreen_required": bool(fullscreen_required),
        "lighting_required": bool(lighting_required),
        "screen_required": bool(screen_required),
    }


def normalize_proctoring_config(proctoring_config: Mapping[str, Any] | None) -> dict[str, Any]:
    base = dict(proctoring_config or {})
    requirements = get_proctoring_requirements(base)
    base.update({
        "alert_rules": normalize_alert_rules(base.get("alert_rules")),
        "identity_required": requirements["identity_required"],
        "camera_required": requirements["camera_required"],
        "mic_required": requirements["mic_required"],
        "fullscreen_required": requirements["fullscreen_required"],
        "lighting_required": requirements["lighting_required"],
        "screen_required": requirements["screen_required"],
        "screen_capture": requirements["screen_required"],
        "fullscreen_enforce": requirements["fullscreen_required"],
        "face_verify": requirements["identity_required"],
    })
    return base
