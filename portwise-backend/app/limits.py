"""Request limits for the public API: body size and a per-client rate limit.

Both are plain ASGI middleware with in-memory state, which suits a single API
container. Behind several replicas, move rate limiting to the proxy or Redis.
"""
from __future__ import annotations

import json
import os
import threading
import time
from collections import OrderedDict, deque
from typing import Deque

ADMIN_IMPORT_PATHS = ("/api/v1/admin/tariffs/import",)
MAX_BODY_BYTES = int(os.getenv("MAX_BODY_BYTES", str(64 * 1024)))
MAX_IMPORT_BODY_BYTES = int(os.getenv("MAX_IMPORT_BODY_BYTES", str(2_200_000)))
RATE_LIMITED_PREFIX = "/api/v1/calculate"


def _json(send, status: int, code: str, detail: str, headers=()):
    async def respond():
        body = json.dumps({"success": False, "code": code, "detail": detail}).encode()
        await send({
            "type": "http.response.start",
            "status": status,
            "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode()), *headers],
        })
        await send({"type": "http.response.body", "body": body})
    return respond()


def client_ip_from_scope(scope) -> str:
    """The right-most X-Forwarded-For hop (appended by our proxy), else the socket peer."""
    for name, value in scope.get("headers", []):
        if name == b"x-forwarded-for":
            hops = [h.strip() for h in value.decode("latin-1").split(",") if h.strip()]
            if hops:
                return hops[-1]
    client = scope.get("client")
    return client[0] if client else "unknown"


class BodySizeLimit:
    """Rejects request bodies over the limit with 413, whether or not Content-Length is sent."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] in ("GET", "HEAD", "OPTIONS"):
            return await self.app(scope, receive, send)
        limit = MAX_IMPORT_BODY_BYTES if scope["path"] in ADMIN_IMPORT_PATHS else MAX_BODY_BYTES
        for name, value in scope.get("headers", []):
            if name == b"content-length" and value.isdigit() and int(value) > limit:
                return await _json(send, 413, "payload_too_large", f"The request is larger than {limit // 1024} KB.")

        received = 0
        too_large = False

        async def guarded_receive():
            nonlocal received, too_large
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    too_large = True
                    return {"type": "http.disconnect"}
            return message

        started = False

        async def guarded_send(message):
            nonlocal started
            if too_large and not started:
                started = True
                return await _json(send, 413, "payload_too_large", f"The request is larger than {limit // 1024} KB.")
            if not too_large:
                started = started or message["type"] == "http.response.start"
                await send(message)

        return await self.app(scope, guarded_receive, guarded_send)


_hits: "OrderedDict[str, Deque[float]]" = OrderedDict()
_hits_lock = threading.Lock()


def reset_rate_limit() -> None:
    with _hits_lock:
        _hits.clear()


class RateLimit:
    """At most RATE_LIMIT_PER_MINUTE calculation requests per client per minute (0 turns it off)."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        limit = int(os.getenv("RATE_LIMIT_PER_MINUTE", "60"))
        if scope["type"] != "http" or limit <= 0 or scope["method"] != "POST" or not scope["path"].startswith(RATE_LIMITED_PREFIX):
            return await self.app(scope, receive, send)
        ip = client_ip_from_scope(scope)
        now = time.monotonic()
        with _hits_lock:
            q = _hits.setdefault(ip, deque())
            while q and now - q[0] > 60:
                q.popleft()
            blocked = len(q) >= limit
            if not blocked:
                q.append(now)
            _hits.move_to_end(ip)
            while len(_hits) > 10_000:
                _hits.popitem(last=False)
        if blocked:
            retry = max(1, int(60 - (now - q[0])))
            return await _json(
                send, 429, "rate_limited", "Too many calculations in a short time. Wait a few seconds and try again.",
                headers=[(b"retry-after", str(retry).encode())],
            )
        return await self.app(scope, receive, send)
