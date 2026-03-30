import json
import time
from typing import Any, Dict, List
import httpx
from ..core.config import get_settings
from ..models import ProctoringEvent

settings = get_settings()


async def dispatch_integrations(event: Dict[str, Any], config: Dict[str, Any]) -> Dict[str, str]:
    """
    Send event payload to enabled integrations.
    event: {event_type, severity?, detail?, source, timestamp, extra?}
    config: saved settings dict keyed by integration key
    """
    results: Dict[str, str] = {}
    async with httpx.AsyncClient(timeout=5) as client:
        for key, entry in (config or {}).items():
            if not isinstance(entry, dict):
                continue
            if not entry.get("enabled"):
                continue
            url = entry.get("url")
            if not url:
                results[key] = "skipped: missing url"
                continue
            try:
                headers = {}
                if entry.get("secret"):
                    headers["X-Integration-Secret"] = entry["secret"]
                await client.post(url, json=event, headers=headers)
                results[key] = "sent"
            except Exception as exc:
                results[key] = f"error: {exc}"
    return results


async def send_proctoring_integration_event(event: ProctoringEvent, config: Dict[str, Any]):
    payload = {
        "event_type": f"PROCTOR_{event.event_type}",
        "severity": event.severity.value if hasattr(event.severity, "value") else str(event.severity),
        "detail": event.detail,
        "source": "proctoring",
        "timestamp": event.occurred_at.isoformat() if event.occurred_at else time.time(),
        "attempt_id": str(event.attempt_id),
    }
    return await dispatch_integrations(payload, config)


async def send_report_integration_event(report_path: str, config: Dict[str, Any]):
    payload = {
        "event_type": "REPORT_COMPLETE",
        "source": "reports",
        "timestamp": time.time(),
        "detail": report_path,
    }
    return await dispatch_integrations(payload, config)
