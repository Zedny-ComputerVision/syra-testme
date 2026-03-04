"""Cooldown-aware alert aggregator.

Collects detection events with per-type cooldown to prevent alert flooding.
drain() returns pending events and resets the buffer.
"""
import time

COOLDOWNS = {
    "HIGH": 5.0,
    "MEDIUM": 10.0,
    "LOW": 15.0,
}


class AlertLogger:
    def __init__(self, cooldowns: dict[str, float] = None):
        self.cooldowns = cooldowns or COOLDOWNS
        self._events: list[dict] = []
        self._last_fired: dict[str, float] = {}

    def add(self, event: dict | None):
        """Add an event if it passes the cooldown check."""
        if not event:
            return
        event_type = event.get("event_type", "UNKNOWN")
        severity = event.get("severity", "LOW")
        now = time.time()

        cooldown = self.cooldowns.get(severity, 10.0)
        last = self._last_fired.get(event_type, 0)

        if now - last >= cooldown:
            self._events.append(event)
            self._last_fired[event_type] = now

    def drain(self) -> list[dict]:
        """Return all pending events and clear the buffer."""
        events = self._events[:]
        self._events.clear()
        return events

    @property
    def total_alerts(self) -> int:
        return len(self._last_fired)
