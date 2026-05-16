"""Admin router — all endpoints gated by ROPARUN_ADMIN_TOKEN.

Scope (Phase 3.6):
  - Light-metadata CRUD for routes, teams, events, devices, waypoints.
  - List + delete for positions (cursor-paginated, BRIN-friendly) and
    change events.
  - Curated cleanup actions.

Out of scope: geometry editing for stages/waypoints (use the planner /
GPX upload). Audit log, multi-user roles, magic-link auth — all later.
"""

from __future__ import annotations

import base64
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from geoalchemy2.shape import to_shape
from sqlalchemy import CursorResult, and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import (
    ChangeEvent,
    Device,
    Event,
    PairingToken,
    Position,
    Route,
    Team,
    Waypoint,
    WaypointKind,
)
from ..models.device import _new_token
from ..schemas.admin import (
    ChangeEventOut,
    ChangeEventPage,
    CleanupOrphanBody,
    CleanupPairingBody,
    CleanupPositionsBody,
    CleanupResult,
    DeviceAdminOut,
    DevicePatch,
    EventPatch,
    PositionOut,
    PositionPage,
    RotateTokenOut,
    RoutePatch,
    Stats,
    TeamPatch,
    WaypointPatch,
)
from ..schemas.route import EventOut, RouteSummary, TeamOut, WaypointOut
from ..security import require_admin


def _xy(geom: Any) -> tuple[float, float]:
    """Pull lng/lat out of a Geography POINT column. Inputs are typed as
    `object` on the model; `geoalchemy2.shape.to_shape` accepts the
    underlying WKB/WKT elements at runtime — the `Any` annotation here
    matches the same pattern used by `services/geo.py`."""
    pt = to_shape(geom)
    return pt.x, pt.y


router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin)],
)


# ---- Ping / stats ----------------------------------------------------------


@router.get("/ping")
async def ping() -> dict[str, bool]:
    """Auth check — used by the frontend's AuthPrompt to validate a
    user-entered token before storing it in localStorage."""
    return {"ok": True}


@router.get("/stats", response_model=Stats)
async def stats(
    event_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> Stats:
    """Aggregate counts for the dashboard. Position counts are
    event-scoped via the device→event join."""
    if (await session.get(Event, event_id)) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "event not found")
    routes = await session.scalar(
        select(func.count()).select_from(Route).where(Route.event_id == event_id),
    )
    devices = await session.scalar(
        select(func.count()).select_from(Device).where(Device.event_id == event_id),
    )
    # Sub-select device ids for this event; positions + change_events have
    # device_id FK only.
    dev_ids = select(Device.id).where(Device.event_id == event_id).scalar_subquery()
    positions = await session.scalar(
        select(func.count()).select_from(Position).where(Position.device_id.in_(dev_ids)),
    )
    since_24h = datetime.now(UTC) - timedelta(hours=24)
    positions_24h = await session.scalar(
        select(func.count())
        .select_from(Position)
        .where(Position.device_id.in_(dev_ids), Position.ts >= since_24h),
    )
    change_events = await session.scalar(
        select(func.count()).select_from(ChangeEvent).where(ChangeEvent.device_id.in_(dev_ids)),
    )
    waypoints = await session.scalar(
        select(func.count())
        .select_from(Waypoint)
        .join(Route, Route.id == Waypoint.route_id)
        .where(Route.event_id == event_id),
    )
    return Stats(
        event_id=event_id,
        routes=routes or 0,
        devices=devices or 0,
        positions=positions or 0,
        positions_24h=positions_24h or 0,
        change_events=change_events or 0,
        waypoints=waypoints or 0,
    )


# ---- Routes ----------------------------------------------------------------


@router.patch("/routes/{route_id}", response_model=RouteSummary)
async def patch_route(
    route_id: uuid.UUID,
    payload: RoutePatch,
    session: AsyncSession = Depends(get_session),
) -> Route:
    route = await session.get(Route, route_id)
    if route is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "route not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(route, k, v)
    await session.commit()
    await session.refresh(route)
    return route


# ---- Teams -----------------------------------------------------------------


@router.patch("/teams/{team_id}", response_model=TeamOut)
async def patch_team(
    team_id: uuid.UUID,
    payload: TeamPatch,
    session: AsyncSession = Depends(get_session),
) -> Team:
    team = await session.get(Team, team_id)
    if team is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "team not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(team, k, v)
    await session.commit()
    await session.refresh(team)
    return team


@router.delete("/teams/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_team(team_id: uuid.UUID, session: AsyncSession = Depends(get_session)) -> None:
    team = await session.get(Team, team_id)
    if team is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "team not found")
    await session.delete(team)
    await session.commit()


# ---- Events ----------------------------------------------------------------


@router.patch("/events/{event_id}", response_model=EventOut)
async def patch_event(
    event_id: uuid.UUID,
    payload: EventPatch,
    session: AsyncSession = Depends(get_session),
) -> Event:
    event = await session.get(Event, event_id)
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "event not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(event, k, v)
    await session.commit()
    await session.refresh(event)
    return event


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(event_id: uuid.UUID, session: AsyncSession = Depends(get_session)) -> None:
    event = await session.get(Event, event_id)
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "event not found")
    await session.delete(event)
    await session.commit()


# ---- Devices ---------------------------------------------------------------


@router.get("/devices", response_model=list[DeviceAdminOut])
async def list_devices(
    event_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> list[DeviceAdminOut]:
    """List devices for an event with position+change-event counts and
    last-seen ts. Single query per scalar count — fine at device scale
    (low tens of rows per event)."""
    devices_q = select(Device).where(Device.event_id == event_id).order_by(Device.created_at.desc())
    devices = list((await session.execute(devices_q)).scalars())
    out: list[DeviceAdminOut] = []
    for d in devices:
        pos_count = (
            await session.scalar(
                select(func.count()).select_from(Position).where(Position.device_id == d.id),
            )
        ) or 0
        change_count = (
            await session.scalar(
                select(func.count()).select_from(ChangeEvent).where(ChangeEvent.device_id == d.id),
            )
        ) or 0
        last_ts = await session.scalar(
            select(func.max(Position.ts)).where(Position.device_id == d.id),
        )
        out.append(
            DeviceAdminOut(
                id=d.id,
                event_id=d.event_id,
                name=d.name,
                role=d.role,
                created_at=d.created_at,
                last_seen_at=last_ts,
                position_count=pos_count,
                change_event_count=change_count,
            ),
        )
    return out


@router.patch("/devices/{device_id}", response_model=DeviceAdminOut)
async def patch_device(
    device_id: uuid.UUID,
    payload: DevicePatch,
    session: AsyncSession = Depends(get_session),
) -> DeviceAdminOut:
    device = await session.get(Device, device_id)
    if device is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "device not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(device, k, v)
    await session.commit()
    await session.refresh(device)
    return DeviceAdminOut(
        id=device.id,
        event_id=device.event_id,
        name=device.name,
        role=device.role,
        created_at=device.created_at,
        last_seen_at=None,
        position_count=0,
        change_event_count=0,
    )


@router.post("/devices/{device_id}/rotate-token", response_model=RotateTokenOut)
async def rotate_device_token(
    device_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> RotateTokenOut:
    device = await session.get(Device, device_id)
    if device is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "device not found")
    device.token = _new_token()
    await session.commit()
    await session.refresh(device)
    return RotateTokenOut(token=device.token)


@router.delete("/devices/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_device(device_id: uuid.UUID, session: AsyncSession = Depends(get_session)) -> None:
    device = await session.get(Device, device_id)
    if device is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "device not found")
    await session.delete(device)
    await session.commit()


# ---- Waypoints -------------------------------------------------------------


@router.get("/waypoints", response_model=list[WaypointOut])
async def list_waypoints(
    route_id: uuid.UUID,
    kind: WaypointKind | None = None,
    category: str | None = None,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> list[Waypoint]:
    stmt = select(Waypoint).where(Waypoint.route_id == route_id)
    if kind is not None:
        stmt = stmt.where(Waypoint.kind == kind)
    if category is not None:
        stmt = stmt.where(Waypoint.category == category)
    stmt = stmt.order_by(Waypoint.created_at.asc()).limit(limit).offset(offset)
    result = await session.execute(stmt)
    return list(result.scalars())


@router.patch("/waypoints/{waypoint_id}", response_model=WaypointOut)
async def patch_waypoint(
    waypoint_id: uuid.UUID,
    payload: WaypointPatch,
    session: AsyncSession = Depends(get_session),
) -> Waypoint:
    waypoint = await session.get(Waypoint, waypoint_id)
    if waypoint is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "waypoint not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(waypoint, k, v)
    await session.commit()
    await session.refresh(waypoint)
    return waypoint


@router.delete("/waypoints/{waypoint_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_waypoint(
    waypoint_id: uuid.UUID, session: AsyncSession = Depends(get_session)
) -> None:
    waypoint = await session.get(Waypoint, waypoint_id)
    if waypoint is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "waypoint not found")
    await session.delete(waypoint)
    await session.commit()


# ---- Positions -------------------------------------------------------------


def _encode_cursor(ts: datetime, pid: uuid.UUID) -> str:
    raw = f"{ts.isoformat()}|{pid}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def _decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        raw = base64.urlsafe_b64decode(cursor.encode()).decode()
        ts_str, pid_str = raw.split("|", 1)
        return datetime.fromisoformat(ts_str), uuid.UUID(pid_str)
    except (ValueError, TypeError) as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"bad cursor: {exc}") from exc


@router.get("/positions", response_model=PositionPage)
async def list_positions(
    event_id: uuid.UUID | None = None,
    device_id: uuid.UUID | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    cursor: str | None = None,
    limit: int = Query(default=50, ge=1, le=500),
    session: AsyncSession = Depends(get_session),
) -> PositionPage:
    """Cursor-paginated position feed. Ordered by (ts DESC, id DESC); the
    cursor encodes the last row's (ts, id) so the next page does
    `(ts, id) < (cursor_ts, cursor_id)`. This pairs with the existing
    btree(device_id, ts) and BRIN(ts) indexes."""
    stmt = select(Position)
    if event_id is not None:
        dev_ids = select(Device.id).where(Device.event_id == event_id).scalar_subquery()
        stmt = stmt.where(Position.device_id.in_(dev_ids))
    if device_id is not None:
        stmt = stmt.where(Position.device_id == device_id)
    if since is not None:
        stmt = stmt.where(Position.ts >= since)
    if until is not None:
        stmt = stmt.where(Position.ts <= until)
    if cursor:
        c_ts, c_id = _decode_cursor(cursor)
        stmt = stmt.where(
            or_(
                Position.ts < c_ts,
                and_(Position.ts == c_ts, Position.id < c_id),
            ),
        )
    stmt = stmt.order_by(Position.ts.desc(), Position.id.desc()).limit(limit + 1)
    rows = list((await session.execute(stmt)).scalars())
    has_more = len(rows) > limit
    rows = rows[:limit]
    items: list[PositionOut] = []
    for r in rows:
        lng, lat = _xy(r.geom)
        items.append(
            PositionOut(
                id=r.id,
                device_id=r.device_id,
                ts=r.ts,
                lng=lng,
                lat=lat,
                accuracy_m=r.accuracy_m,
                speed_mps=r.speed_mps,
                heading_deg=r.heading_deg,
                battery_pct=r.battery_pct,
            ),
        )
    next_cursor = _encode_cursor(rows[-1].ts, rows[-1].id) if has_more and rows else None
    return PositionPage(items=items, next_cursor=next_cursor)


@router.delete("/positions/{position_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_position(
    position_id: uuid.UUID, session: AsyncSession = Depends(get_session)
) -> None:
    position = await session.get(Position, position_id)
    if position is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "position not found")
    await session.delete(position)
    await session.commit()


# ---- Change events ---------------------------------------------------------


@router.get("/change-events", response_model=ChangeEventPage)
async def list_change_events(
    event_id: uuid.UUID | None = None,
    device_id: uuid.UUID | None = None,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> ChangeEventPage:
    base = select(ChangeEvent, Device.name).join(Device, Device.id == ChangeEvent.device_id)
    if event_id is not None:
        base = base.where(Device.event_id == event_id)
    if device_id is not None:
        base = base.where(ChangeEvent.device_id == device_id)
    # total count — same filters, separate query.
    count_stmt = (
        select(func.count())
        .select_from(ChangeEvent)
        .join(Device, Device.id == ChangeEvent.device_id)
    )
    if event_id is not None:
        count_stmt = count_stmt.where(Device.event_id == event_id)
    if device_id is not None:
        count_stmt = count_stmt.where(ChangeEvent.device_id == device_id)
    total = await session.scalar(count_stmt) or 0
    stmt = base.order_by(ChangeEvent.ts.desc()).limit(limit).offset(offset)
    rows = list((await session.execute(stmt)).all())
    items: list[ChangeEventOut] = []
    for ce, dev_name in rows:
        lng, lat = _xy(ce.geom)
        items.append(
            ChangeEventOut(
                id=ce.id,
                device_id=ce.device_id,
                device_name=dev_name,
                ts=ce.ts,
                lng=lng,
                lat=lat,
            ),
        )
    return ChangeEventPage(items=items, total=total)


@router.delete("/change-events/{change_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_change_event(
    change_id: uuid.UUID, session: AsyncSession = Depends(get_session)
) -> None:
    ce = await session.get(ChangeEvent, change_id)
    if ce is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "change event not found")
    await session.delete(ce)
    await session.commit()


# ---- Cleanup actions -------------------------------------------------------


@router.post("/cleanup/positions", response_model=CleanupResult)
async def cleanup_positions(
    body: CleanupPositionsBody,
    session: AsyncSession = Depends(get_session),
) -> CleanupResult:
    """Bulk-delete positions older than `older_than` for the given event."""
    dev_ids = select(Device.id).where(Device.event_id == body.event_id).scalar_subquery()
    stmt = (
        delete(Position).where(Position.device_id.in_(dev_ids)).where(Position.ts < body.older_than)
    )
    result: CursorResult[Any] = await session.execute(stmt)  # type: ignore[assignment]
    await session.commit()
    return CleanupResult(deleted=result.rowcount or 0)


@router.post("/cleanup/orphan-devices", response_model=CleanupResult)
async def cleanup_orphan_devices(
    body: CleanupOrphanBody,
    session: AsyncSession = Depends(get_session),
) -> CleanupResult:
    """Delete devices for an event that have zero positions, zero change
    events, and were created more than 1 hour ago (so we don't accidentally
    sweep a freshly-paired phone that hasn't pinged yet)."""
    cutoff = datetime.now(UTC) - timedelta(hours=1)
    pos_subq = select(Position.device_id).distinct().subquery()
    chg_subq = select(ChangeEvent.device_id).distinct().subquery()
    stmt = (
        select(Device)
        .where(Device.event_id == body.event_id)
        .where(Device.created_at < cutoff)
        .where(Device.id.not_in(select(pos_subq.c.device_id)))
        .where(Device.id.not_in(select(chg_subq.c.device_id)))
    )
    orphans = list((await session.execute(stmt)).scalars())
    for d in orphans:
        await session.delete(d)
    await session.commit()
    return CleanupResult(deleted=len(orphans))


@router.post("/cleanup/pairing-tokens", response_model=CleanupResult)
async def cleanup_pairing_tokens(
    body: CleanupPairingBody,
    session: AsyncSession = Depends(get_session),
) -> CleanupResult:
    """Delete pairing tokens for the event that have already been
    redeemed or expired. Cosmetic — old tokens can't be reused, but
    they pile up."""
    now = datetime.now(UTC)
    stmt = (
        delete(PairingToken)
        .where(PairingToken.event_id == body.event_id)
        .where(
            or_(
                PairingToken.redeemed_at.is_not(None),
                PairingToken.expires_at < now,
            ),
        )
    )
    result: CursorResult[Any] = await session.execute(stmt)  # type: ignore[assignment]
    await session.commit()
    return CleanupResult(deleted=result.rowcount or 0)
