"""Tracker bearer-token auth — the only auth scheme in Phase 3.

A device registers via POST /devices and receives a persistent token. The
PWA sends it on every /ingest as `Authorization: Bearer <token>`. This is
deliberately simple: no refresh, no expiry, no rotation. Phase 3.5 will
replace it with magic-link-issued short-lived device JWTs.
"""

from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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
