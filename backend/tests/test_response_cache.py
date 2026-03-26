from __future__ import annotations

import threading
import time

from app.utils.response_cache import TimedSingleFlightCache


def test_waiting_requests_fall_back_after_configured_timeout() -> None:
    cache: TimedSingleFlightCache[str] = TimedSingleFlightCache(
        ttl_seconds=5.0,
        wait_timeout_seconds=0.05,
    )
    owner_started = threading.Event()
    release_owner = threading.Event()
    owner_result: dict[str, str] = {}

    def owner_compute() -> str:
        owner_started.set()
        release_owner.wait(timeout=1.0)
        return "owner"

    def run_owner() -> None:
        owner_result["value"] = cache.get_or_compute("tests:list", owner_compute)

    owner_thread = threading.Thread(target=run_owner)
    owner_thread.start()
    assert owner_started.wait(timeout=1.0)

    started_at = time.monotonic()
    waiter_value = cache.get_or_compute("tests:list", lambda: "waiter")
    elapsed = time.monotonic() - started_at

    release_owner.set()
    owner_thread.join(timeout=1.0)

    assert waiter_value == "waiter"
    assert owner_result["value"] == "owner"
    assert elapsed < 0.15
