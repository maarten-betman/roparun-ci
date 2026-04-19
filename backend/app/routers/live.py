from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from sqlalchemy import and_, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import SessionLocal, get_session
from ..models import Device, Event, Position, Team
from ..schemas.tracking import LiveDevice, LivePoint, LiveSnapshot
from ..services.geo import to_point
from ..services.live_hub import Channel, hub

router = APIRouter(tags=["tracking"])

# Cap the breadcrumb depth so /live is cheap even after multi-hour events.
# Viewer fills in from the WebSocket stream once connected.
BREADCRUMB_LIMIT = 30


@router.get("/public/{team_slug}/{year}/live", response_model=LiveSnapshot)
async def live_snapshot(
    team_slug: str,
    year: int,
    session: AsyncSession = Depends(get_session),
) -> LiveSnapshot:
    event_id = await _event_id(session, team_slug, year)
    if event_id is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "team+year not found")

    devices = (
        (await session.execute(select(Device).where(Device.event_id == event_id))).scalars().all()
    )

    out: list[LiveDevice] = []
    for d in devices:
        breadcrumb = await _breadcrumb(session, d.id, BREADCRUMB_LIMIT)
        if not breadcrumb:
            continue
        out.append(
            LiveDevice(
                id=d.id,
                name=d.name,
                role=d.role,
                last=breadcrumb[0],
                breadcrumb=breadcrumb,
            )
        )
    return LiveSnapshot(devices=out)


@router.websocket("/ws/live/{team_slug}/{year}")
async def live_ws(ws: WebSocket, team_slug: str, year: int) -> None:
    """Fan-out channel for new positions. Listeners receive the JSON-encoded
    LiveUpdate messages produced by /ingest. Open access (no auth) — anyone
    who can load the public viewer can subscribe."""
    async with SessionLocal() as session:
        event_id = await _event_id(session, team_slug, year)
    if event_id is None:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    channel = Channel(team_slug=team_slug, year=year)
    hub.bind_event(event_id, channel)
    await ws.accept()
    await hub.register_listener(channel, ws)
    try:
        # Keep the connection alive; the client is a pure listener. If the
        # client sends anything we ignore it.
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await hub.unregister_listener(channel, ws)


async def _event_id(session: AsyncSession, team_slug: str, year: int) -> uuid.UUID | None:
    stmt = (
        select(Event.id)
        .join(Team, Team.id == Event.team_id)
        .where(and_(Team.slug == team_slug, Event.year == year))
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def _breadcrumb(session: AsyncSession, device_id: uuid.UUID, limit: int) -> list[LivePoint]:
    stmt = (
        select(Position)
        .where(Position.device_id == device_id)
        .order_by(desc(Position.ts))
        .limit(limit)
    )
    rows = (await session.execute(stmt)).scalars().all()
    out: list[LivePoint] = []
    for p in rows:
        pt = to_point(p.geom)
        out.append(
            LivePoint(
                ts=p.ts,
                lng=pt.coordinates[0],
                lat=pt.coordinates[1],
                accuracy_m=p.accuracy_m,
                speed_mps=p.speed_mps,
                heading_deg=p.heading_deg,
                battery_pct=p.battery_pct,
            )
        )
    return out
