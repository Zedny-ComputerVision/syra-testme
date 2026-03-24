import logging
import mimetypes
from datetime import datetime, timezone
from pathlib import Path

import httpx

from ..core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def cloudflare_video_storage_enabled() -> bool:
    return bool(str(settings.CLOUDFLARE_MEDIA_API_BASE_URL or "").strip())


def _base_url() -> str:
    return str(settings.CLOUDFLARE_MEDIA_API_BASE_URL or "").rstrip("/")


def _extract_video_payload(payload: object) -> dict:
    if not isinstance(payload, dict):
        return {}

    for key in ("video", "data", "result"):
        candidate = payload.get(key)
        if isinstance(candidate, dict) and candidate:
            return candidate

    return payload


def _normalize_remote_video(
    payload: dict,
    *,
    filename: str,
    source: str,
    fallback_size: int,
    fallback_created_at: datetime,
) -> dict:
    playback_url = str(payload.get("playback_url") or payload.get("url") or "").strip()
    created_at = payload.get("created") or fallback_created_at.astimezone(timezone.utc).isoformat()
    raw_status = str(payload.get("status") or "").strip().lower()
    ready_to_stream = payload.get("ready_to_stream")
    if ready_to_stream is None:
        ready_to_stream = bool(playback_url)
    return {
        "provider": "cloudflare",
        "name": str(payload.get("name") or filename),
        "url": playback_url,
        "playback_url": playback_url,
        "playback_type": "hls" if playback_url.endswith(".m3u8") else "direct",
        "thumbnail": payload.get("thumbnail"),
        "uid": payload.get("uid"),
        "status": raw_status or ("ready" if ready_to_stream else "processing"),
        "ready_to_stream": bool(ready_to_stream),
        "duration": payload.get("duration"),
        "size": int(payload.get("size") or fallback_size or 0),
        "source": source,
        "created_at": created_at,
        "remote": payload,
    }


async def _lookup_video_by_name(filename: str, source: str, fallback_size: int) -> dict:
    params = {"search": filename}
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.get(f"{_base_url()}/videos", params=params)
        response.raise_for_status()
        payload = response.json()

    if not isinstance(payload, dict):
        return {}

    videos = payload.get("videos")
    if not isinstance(videos, list):
        return {}

    exact_matches = [item for item in videos if isinstance(item, dict) and str(item.get("name") or "") == filename]
    if not exact_matches:
        return {}

    best = sorted(exact_matches, key=lambda item: str(item.get("created") or ""), reverse=True)[0]
    return _normalize_remote_video(
        best,
        filename=filename,
        source=source,
        fallback_size=fallback_size,
        fallback_created_at=datetime.now(timezone.utc),
    )


async def upload_video_to_cloudflare(file_path: Path, *, filename: str, source: str) -> dict:
    content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    file_size = file_path.stat().st_size if file_path.exists() else 0
    params = {
        "require_signed_urls": settings.CLOUDFLARE_MEDIA_REQUIRE_SIGNED_URLS,
    }
    if settings.CLOUDFLARE_MEDIA_WATERMARK_UID:
        params["watermark_uid"] = settings.CLOUDFLARE_MEDIA_WATERMARK_UID

    async with httpx.AsyncClient(timeout=300) as client:
        with file_path.open("rb") as handle:
            response = await client.post(
                f"{_base_url()}/upload/single",
                params=params,
                files={"file": (filename, handle, content_type)},
            )
            response.raise_for_status()
            payload = response.json()

    normalized = _normalize_remote_video(
        _extract_video_payload(payload),
        filename=filename,
        source=source,
        fallback_size=file_size,
        fallback_created_at=datetime.now(timezone.utc),
    )
    if normalized.get("url"):
        return normalized

    looked_up = await _lookup_video_by_name(filename, source, normalized.get("size") or file_size)
    if looked_up.get("url"):
        return looked_up

    raise RuntimeError("Cloudflare upload succeeded but no playback URL was returned")


async def upload_video_content_to_cloudflare(
    content: bytes,
    *,
    filename: str,
    source: str,
    content_type: str = "application/octet-stream",
) -> dict:
    params = {
        "require_signed_urls": settings.CLOUDFLARE_MEDIA_REQUIRE_SIGNED_URLS,
    }
    if settings.CLOUDFLARE_MEDIA_WATERMARK_UID:
        params["watermark_uid"] = settings.CLOUDFLARE_MEDIA_WATERMARK_UID

    async with httpx.AsyncClient(timeout=300) as client:
        response = await client.post(
            f"{_base_url()}/upload/single",
            params=params,
            files={"file": (filename, content, content_type)},
        )
        response.raise_for_status()
        payload = response.json()

    normalized = _normalize_remote_video(
        _extract_video_payload(payload),
        filename=filename,
        source=source,
        fallback_size=len(content or b""),
        fallback_created_at=datetime.now(timezone.utc),
    )
    if normalized.get("url"):
        return normalized

    looked_up = await _lookup_video_by_name(filename, source, normalized.get("size") or 0)
    if looked_up.get("url"):
        return looked_up

    raise RuntimeError("Cloudflare upload succeeded but no playback URL was returned")
