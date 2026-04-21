from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import ChangeEvent, Device, Event, Team
from ..schemas.geojson import Point
from ..schemas.tracking import (
    ChangeEventBroadcast,
    ChangeEventIn,
    ChangeEventOut,
)
from ..security import current_device
from ..services.geo import point_to_wkt, to_point
from ..services.live_hub import Channel, hub

router = APIRouter(tags=["tracking"])


@router.post(
    "/change-events",
    response_model=ChangeEventOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_change_event(
    payload: ChangeEventIn,
    device: Device = Depends(current_device),
    session: AsyncSession = Depends(get_session),
) -> ChangeEventOut:
    """Record a runner hand-over the driver just completed.

    Broadcast over the event's /ws/live channel so the public viewer and
    every paired driver tracker can update their "next expected change"
    projection without polling.
    """
    row = ChangeEvent(
        device_id=device.id,
        ts=payload.ts,
        geom=point_to_wkt(Point(coordinates=(payload.lng, payload.lat))),
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)

    out = ChangeEventOut(
        id=row.id,
        device_id=device.id,
        device_name=device.name,
        ts=row.ts,
        lng=payload.lng,
        lat=payload.lat,
    )

    channel = hub.channel_for_event(device.event_id)
    if channel is None:
        channel = await _resolve_channel(session, device.event_id)
        if channel is not None:
            hub.bind_event(device.event_id, channel)
    if channel is not None:
        broadcast = ChangeEventBroadcast(event=out)
        await hub.broadcast(channel, broadcast.model_dump(mode="json"))

    return out


@router.get(
    "/public/{team_slug}/{year}/change-events",
    response_model=list[ChangeEventOut],
)
async def list_change_events(
    team_slug: str,
    year: int,
    limit: int = Query(default=50, ge=1, le=500),
    session: AsyncSession = Depends(get_session),
) -> list[ChangeEventOut]:
    event_id = await _event_id(session, team_slug, year)
    if event_id is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "team+year not found")

    stmt = (
        select(ChangeEvent, Device.name)
        .join(Device, Device.id == ChangeEvent.device_id)
        .where(Device.event_id == event_id)
        .order_by(desc(ChangeEvent.ts))
        .limit(limit)
    )
    rows = (await session.execute(stmt)).all()
    out: list[ChangeEventOut] = []
    for row in rows:
        ce: ChangeEvent = row[0]
        device_name: str = row[1]
        pt = to_point(ce.geom)
        out.append(
            ChangeEventOut(
                id=ce.id,
                device_id=ce.device_id,
                device_name=device_name,
                ts=ce.ts,
                lng=pt.coordinates[0],
                lat=pt.coordinates[1],
            )
        )
    return out


async def _event_id(session: AsyncSession, team_slug: str, year: int) -> uuid.UUID | None:
    stmt = (
        select(Event.id)
        .join(Team, Team.id == Event.team_id)
        .where(and_(Team.slug == team_slug, Event.year == year))
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def _resolve_channel(session: AsyncSession, event_id: uuid.UUID) -> Channel | None:
    stmt = (
        select(Team.slug, Event.year)
        .join(Event, Event.team_id == Team.id)
        .where(Event.id == event_id)
    )
    row = (await session.execute(stmt)).first()
    if row is None:
        return None
    return Channel(team_slug=row.slug, year=row.year)
