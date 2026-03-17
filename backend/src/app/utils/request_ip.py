from __future__ import annotations

from collections.abc import Mapping


def get_client_ip(*, headers: Mapping[str, object] | None = None, client=None) -> str | None:
    if headers:
        forwarded_for = str(headers.get("x-forwarded-for") or "").strip()
        if forwarded_for:
            first_hop = forwarded_for.split(",", 1)[0].strip()
            if first_hop:
                return first_hop

        real_ip = str(headers.get("x-real-ip") or "").strip()
        if real_ip:
            return real_ip

    return getattr(client, "host", None)


def get_request_ip(request) -> str | None:
    if request is None:
        return None
    return get_client_ip(headers=getattr(request, "headers", None), client=getattr(request, "client", None))


def get_websocket_ip(websocket) -> str | None:
    if websocket is None:
        return None
    return get_client_ip(headers=getattr(websocket, "headers", None), client=getattr(websocket, "client", None))
