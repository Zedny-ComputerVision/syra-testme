"""Cooldown-aware alert aggregator.

Collects detection events with per-event-type cooldown to prevent alert flooding.
drain() returns pending events and resets the buffer.
"""
import time

# Per-event-type cooldowns (seconds).
# Tighter for persistent threats, longer for transient/noisy events.
EVENT_COOLDOWNS: dict[str, float] = {
    "FACE_DISAPPEARED": 5.0,
    "FACE_REAPPEARED": 30.0,
    "MULTIPLE_FACES": 8.0,
    "FACE_MISMATCH": 10.0,
    "FACE_MATCH_RECOVERED": 30.0,
    "EYE_MOVEMENT_DETECTED": 8.0,
    "GAZE_LEFT": 8.0,
    "GAZE_RIGHT": 8.0,
    "GAZE_UP": 8.0,
    "GAZE_DOWN": 8.0,
    "HEAD_POSE": 8.0,
    "HEAD_TURNED_LEFT": 8.0,
    "HEAD_TURNED_RIGHT": 8.0,
    "HEAD_TILTED_UP": 8.0,
    "HEAD_TILTED_DOWN": 8.0,
    "MOUTH_OPEN": 10.0,
    "FORBIDDEN_OBJECT": 10.0,
    "LOUD_AUDIO": 8.0,
    "AUDIO_ANOMALY": 15.0,
    "CAMERA_COVERED": 15.0,
}
_DEFAULT_COOLDOWN = 10.0


class AlertLogger:
    def __init__(self, cooldowns: dict[str, float] | None = None):
        self.cooldowns = cooldowns if cooldowns is not None else EVENT_COOLDOWNS
        self._events: list[dict] = []
        self._last_fired: dict[str, float] = {}

    def add(self, event: dict | None):
        """Add an event if it passes the per-event-type cooldown check."""
        if not event:
            return
        event_type = event.get("event_type", "UNKNOWN")
        now = time.time()
        cooldown = self.cooldowns.get(event_type, _DEFAULT_COOLDOWN)
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
