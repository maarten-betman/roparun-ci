from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Device, Event, Team
from ..schemas.tracking import DeviceCredentials, DeviceRegister

router = APIRouter(prefix="/devices", tags=["tracking"])


@router.post("", response_model=DeviceCredentials, status_code=status.HTTP_201_CREATED)
async def register_device(
    payload: DeviceRegister, session: AsyncSession = Depends(get_session)
) -> DeviceCredentials:
    """Mint a new device + bearer token bound to a team+year event.

    Idempotency is intentionally not provided: every call creates a fresh
    device. Lost tokens mean registering a new device; old positions remain
    attributed to the old row.
    """
    stmt = (
        select(Event)
        .join(Team, Team.id == Event.team_id)
        .where(Team.slug == payload.team_slug, Event.year == payload.year)
    )
    event = (await session.execute(stmt)).scalar_one_or_none()
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "team+year not found")

    device = Device(event_id=event.id, name=payload.name, role=payload.role)
    session.add(device)
    await session.commit()
    await session.refresh(device)
    return DeviceCredentials(
        id=device.id,
        name=device.name,
        role=device.role,
        token=device.token,
        event_id=device.event_id,
    )
