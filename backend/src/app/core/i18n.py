"""Lightweight i18n for backend user-facing messages.

Usage:
    from app.core.i18n import translate as _t

    # In a route with Request available:
    raise HTTPException(status_code=400, detail=_t("invalid_token", request))

    # Without request (falls back to English):
    message = _t("deleted")
"""

import json
from functools import lru_cache
from pathlib import Path
from typing import Optional

from fastapi import Request

MESSAGES_DIR = Path(__file__).resolve().parent.parent / "messages"
SUPPORTED_LOCALES = ("en", "ar", "ur", "am", "id", "si", "ne", "hi", "fil", "bn")
DEFAULT_LOCALE = "en"


@lru_cache(maxsize=len(SUPPORTED_LOCALES))
def _load_messages(locale: str) -> dict[str, str]:
    path = MESSAGES_DIR / f"{locale}.json"
    if not path.exists():
        return {}
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def get_locale(request: Optional[Request] = None) -> str:
    if request is None:
        return DEFAULT_LOCALE
    lang = request.query_params.get("lang")
    if lang and lang in SUPPORTED_LOCALES:
        return lang
    accept = request.headers.get("accept-language", "")
    for part in accept.split(","):
        code = part.split(";")[0].strip().split("-")[0].lower()
        if code in SUPPORTED_LOCALES:
            return code
    return DEFAULT_LOCALE


def translate(key: str, request: Optional[Request] = None, **kwargs) -> str:
    locale = get_locale(request)
    messages = _load_messages(locale)
    text = messages.get(key)
    if text is None:
        text = _load_messages(DEFAULT_LOCALE).get(key, key)
    if kwargs:
        try:
            text = text.format(**kwargs)
        except (KeyError, IndexError):
            pass
    return text
