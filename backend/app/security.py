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
