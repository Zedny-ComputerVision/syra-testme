import logging

from slowapi import Limiter

from ..utils.request_ip import get_request_ip
from .config import get_settings

logger = logging.getLogger(__name__)


def _rate_limit_key(request) -> str:
    return get_request_ip(request) or "unknown"


_settings = get_settings()
_storage_uri = _settings.REDIS_URL or _settings.CELERY_BROKER_URL or "memory://"
if _storage_uri == "memory://":
    logger.warning(
        "Rate limiter using in-memory storage — limits are per-worker, not global. "
        "Set REDIS_URL for shared rate limiting across workers."
    )
limiter = Limiter(key_func=_rate_limit_key, storage_uri=_storage_uri)
