"""Cooldown-aware alert aggregator.

Collects detection events with per-event-type cooldown to prevent alert flooding.
`drain()` returns pending events and clears only the pending buffer so cooldown
state persists across frames.
"""
import time

# Per-event-type cooldowns (seconds).
# Tighter for persistent threats, longer for transient/noisy events.
EVENT_COOLDOWNS: dict[str, float] = {
    "FACE_DISAPPEARED": 3.0,
    "FACE_REAPPEARED": 15.0,
    "MULTIPLE_FACES": 5.0,
    "FACE_MISMATCH": 5.0,
    "FACE_MATCH_RECOVERED": 15.0,
    "EYE_MOVEMENT": 5.0,
    "HEAD_POSE": 5.0,
    "MOUTH_MOVEMENT": 6.0,
    "FORBIDDEN_OBJECT": 6.0,
    "LOUD_AUDIO": 5.0,
    "AUDIO_ANOMALY": 8.0,
    "CAMERA_COVERED": 8.0,
    # Liveness events
    "NO_BLINK": 10.0,       # re-alert every 10 s if face stays blink-free
    "EYES_CLOSED": 5.0,     # re-alert every 5 s if eyes stay closed
    # Screen content analysis
    "REMOTE_DESKTOP_DETECTED": 15.0,
    "FORBIDDEN_CONTENT": 15.0,
    "FORBIDDEN_APPLICATION": 15.0,
    # Browser-level client events (deduped client-side; backend cooldown is secondary)
    "TAB_SWITCH": 3.0,
    "FULLSCREEN_EXIT": 5.0,
    "COPY_PASTE_ATTEMPT": 5.0,
    "SCREENSHOT_ATTEMPT": 10.0,
    "SHORTCUT_BLOCKED": 10.0,
    "RIGHT_CLICK_ATTEMPT": 30.0,
    "DEV_TOOLS_OPEN": 15.0,
    "MULTIPLE_MONITORS": 30.0,
    "VIRTUAL_MACHINE": 120.0,
    "BROWSER_EVENT": 5.0,
    # Emotion / stress
    "STRESS_DETECTED": 30.0,
    # Answer timing
    "FAST_ANSWER": 15.0,
    # Keystroke dynamics
    "KEYSTROKE_ANOMALY": 30.0,
    # Mouse inactivity
    "MOUSE_INACTIVE": 60.0,
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
        """Return all pending events and clear only the pending buffer."""
        events = self._events[:]
        self._events.clear()
        return events

    @property
    def total_alerts(self) -> int:
        return len(self._last_fired)
