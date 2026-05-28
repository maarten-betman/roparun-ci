"""Tracker bearer-token auth — the only auth scheme in Phase 3.

A device registers via POST /devices and receives a persistent token. The
PWA sends it on every /ingest as `Authorization: Bearer <token>`. This is
deliberately simple: no refresh, no expiry, no rotation. Phase 3.5 will
replace it with magic-link-issued short-lived device JWTs.

A separate shared-secret guard (`require_admin`) gates the /admin/*
endpoints. Set ROPARUN_ADMIN_TOKEN to enable; admin clients send the
value as `X-Admin-Token: <secret>`.
"""

from __future__ import annotations

import secrets

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .db import get_session
from .models import Device


async def current_device(request: Request, session: AsyncSession = Depends(get_session)) -> Device:
    header = request.headers.get("authorization") or ""
    prefix, _, token = header.partition(" ")
    if prefix.lower() != "bearer" or not token:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    result = await session.execute(select(Device).where(Device.token == token))
    device = result.scalar_one_or_none()
    if device is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return device


async def require_admin(request: Request) -> None:
    """Guard for /admin/* endpoints. Requires X-Admin-Token header to match
    the ROPARUN_ADMIN_TOKEN env var. 503 when unconfigured so the frontend
    can show a "your admin isn't configured" banner instead of looping on
    401. Constant-time compare via `secrets.compare_digest`.
    """
    expected = get_settings().admin_token
    if not expected:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "admin disabled (ROPARUN_ADMIN_TOKEN unset)",
        )
    token = request.headers.get("x-admin-token") or ""
    if not secrets.compare_digest(token, expected):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid admin token")


REPLAY_COOKIE = "roparun_replay"


def replay_authed(request: Request) -> bool:
    """True if the request may view the replay. Open when no replay
    password is configured; otherwise accepts the replay cookie or a valid
    admin token header (so admins always have access)."""
    pw = get_settings().replay_password
    if not pw:
        return True
    cookie = request.cookies.get(REPLAY_COOKIE) or ""
    if cookie and secrets.compare_digest(cookie, pw):
        return True
    admin = get_settings().admin_token
    header = request.headers.get("x-admin-token") or ""
    return bool(admin) and secrets.compare_digest(header, admin or "")


async def require_replay(request: Request) -> None:
    """Guard for the replay's JSON endpoints (race-track, photos). Cookies
    ride along on same-origin fetches automatically."""
    if not replay_authed(request):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "replay password required")


def media_authed(request: Request) -> bool:
    """Auth for media files. `<img>`/`<video>` can't send headers, so on
    top of the replay cookie we accept a `?k=` query token matching either
    the replay password (shareable links) or the admin token (admin
    thumbnails). Open when no replay password is configured."""
    pw = get_settings().replay_password
    if not pw:
        return True
    cookie = request.cookies.get(REPLAY_COOKIE) or ""
    if cookie and secrets.compare_digest(cookie, pw):
        return True
    k = request.query_params.get("k") or ""
    if k and secrets.compare_digest(k, pw):
        return True
    admin = get_settings().admin_token
    return bool(admin) and bool(k) and secrets.compare_digest(k, admin or "")
