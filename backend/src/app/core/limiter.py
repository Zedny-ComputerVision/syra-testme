from slowapi import Limiter

from ..utils.request_ip import get_request_ip
from .config import get_settings


def _rate_limit_key(request) -> str:
    return get_request_ip(request) or "unknown"


_settings = get_settings()
_storage_uri = _settings.REDIS_URL or "memory://"
limiter = Limiter(key_func=_rate_limit_key, storage_uri=_storage_uri)
