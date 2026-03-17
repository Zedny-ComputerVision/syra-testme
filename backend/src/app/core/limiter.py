from slowapi import Limiter

from ..utils.request_ip import get_request_ip


def _rate_limit_key(request) -> str:
    return get_request_ip(request) or "unknown"


limiter = Limiter(key_func=_rate_limit_key)
