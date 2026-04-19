from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Device, Event, Position, Team
from ..schemas.geojson import Point
from ..schemas.tracking import IngestPayload, LivePoint, LiveUpdate
from ..security import current_device
from ..services.geo import point_to_wkt
from ..services.live_hub import Channel, hub

router = APIRouter(tags=["tracking"])


@router.post("/ingest", status_code=status.HTTP_202_ACCEPTED)
async def ingest_positions(
    payload: IngestPayload,
    device: Device = Depends(current_device),
    session: AsyncSession = Depends(get_session),
) -> dict[str, int]:
    """Persist a batch of GPS fixes and fan-out to /ws/live listeners.

    Assumptions: positions within a batch are in time-order but we don't
    enforce it; Postgres indexes are tolerant either way. Maximum batch size
    is enforced by the Pydantic schema (500) so a single bad client can't
    stall the API thread.
    """
    rows = [
        Position(
            device_id=device.id,
            ts=p.ts,
            geom=point_to_wkt(Point(coordinates=(p.lng, p.lat))),
            accuracy_m=p.accuracy_m,
            speed_mps=p.speed_mps,
            heading_deg=p.heading_deg,
            battery_pct=p.battery_pct,
        )
        for p in payload.positions
    ]
    session.add_all(rows)
    device.last_seen_at = max(p.ts for p in payload.positions)
    await session.commit()

    channel = hub.channel_for_event(device.event_id)
    if channel is None:
        channel = await _resolve_channel(session, device.event_id)
        if channel is not None:
            hub.bind_event(device.event_id, channel)
    if channel is not None:
        update = LiveUpdate(
            device_id=device.id,
            name=device.name,
            role=device.role,
            positions=[
                LivePoint(
                    ts=p.ts,
                    lng=p.lng,
                    lat=p.lat,
                    accuracy_m=p.accuracy_m,
                    speed_mps=p.speed_mps,
                    heading_deg=p.heading_deg,
                    battery_pct=p.battery_pct,
                )
                for p in payload.positions
            ],
        )
        await hub.broadcast(channel, update.model_dump(mode="json"))

    return {"accepted": len(rows)}


async def _resolve_channel(session: AsyncSession, event_id: object) -> Channel | None:
    stmt = (
        select(Team.slug, Event.year)
        .join(Event, Event.team_id == Team.id)
        .where(Event.id == event_id)
    )
    row = (await session.execute(stmt)).first()
    if row is None:
        return None
    return Channel(team_slug=row.slug, year=row.year)
