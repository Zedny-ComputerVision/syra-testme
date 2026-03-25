from __future__ import annotations

import logging

from celery import Celery

from .config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

celery_app = Celery(
    "syra_tasks",
    broker=settings.celery_broker_url or "redis://127.0.0.1:6379/0",
    backend=settings.celery_result_backend or settings.celery_broker_url or "redis://127.0.0.1:6379/0",
)

celery_app.conf.update(
    task_default_queue="proctoring-batch",
    task_track_started=True,
    result_expires=86400,
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

try:
    from ..tasks import proctoring_video  # noqa: F401
except Exception as exc:
    logger.debug("Celery task import deferred or unavailable: %s", exc)
