from __future__ import annotations

import time
from copy import deepcopy
from threading import Event, Lock
from typing import Callable, Generic, TypeVar

T = TypeVar("T")


class TimedSingleFlightCache(Generic[T]):
    """Small in-memory cache with request coalescing for repeated read paths."""

    def __init__(self, ttl_seconds: float, *, wait_timeout_seconds: float = 60.0):
        self.ttl_seconds = float(ttl_seconds)
        self.wait_timeout_seconds = float(wait_timeout_seconds)
        self._entries: dict[str, dict[str, object]] = {}
        self._inflight: dict[str, Event] = {}
        self._lock = Lock()

    def get_or_compute(self, key: str, compute: Callable[[], T]) -> T:
        now = time.monotonic()
        with self._lock:
            cached = self._entries.get(key)
            if cached and float(cached.get("expires_at", 0.0) or 0.0) > now:
                return deepcopy(cached["value"])

            inflight = self._inflight.get(key)
            if inflight is None:
                inflight = Event()
                self._inflight[key] = inflight
                owner = True
            else:
                owner = False

        if owner:
            try:
                value = compute()
                with self._lock:
                    self._entries[key] = {
                        "expires_at": time.monotonic() + self.ttl_seconds,
                        "value": deepcopy(value),
                    }
                return deepcopy(value)
            finally:
                with self._lock:
                    completed = self._inflight.pop(key, None)
                if completed is not None:
                    completed.set()

        inflight.wait(timeout=self.wait_timeout_seconds)
        with self._lock:
            cached = self._entries.get(key)
            if cached and float(cached.get("expires_at", 0.0) or 0.0) > time.monotonic():
                return deepcopy(cached["value"])
        return compute()

    def invalidate(self, key_prefix: str | None = None) -> None:
        with self._lock:
            if key_prefix is None:
                self._entries.clear()
                return
            matching = [key for key in self._entries if key.startswith(key_prefix)]
            for key in matching:
                self._entries.pop(key, None)

    def read(self, key: str) -> T | None:
        with self._lock:
            cached = self._entries.get(key)
            if not cached:
                return None
            if float(cached.get("expires_at", 0.0) or 0.0) <= time.monotonic():
                self._entries.pop(key, None)
                return None
            return deepcopy(cached["value"])

    def write(self, key: str, value: T) -> None:
        with self._lock:
            self._entries[key] = {
                "expires_at": time.monotonic() + self.ttl_seconds,
                "value": deepcopy(value),
            }
