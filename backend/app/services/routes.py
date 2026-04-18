"""Shared persistence helpers for routes + stages + waypoints."""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Route, Stage, Waypoint
from ..schemas.route import (
    RouteDetail,
    RouteReplace,
    StageIn,
    StageOut,
    WaypointIn,
    WaypointOut,
)
from .geo import linestring_to_wkt, point_to_wkt, to_linestring, to_point


async def load_route_detail(session: AsyncSession, route: Route) -> RouteDetail:
    stages_stmt = (
        select(Stage, func.ST_Length(Stage.geom).label("distance_m"))
        .where(Stage.route_id == route.id)
        .order_by(Stage.ordinal)
    )
    wp_stmt = select(Waypoint).where(Waypoint.route_id == route.id).order_by(Waypoint.created_at)

    stages_rows = (await session.execute(stages_stmt)).all()
    wp_rows = (await session.execute(wp_stmt)).scalars().all()

    stages: list[StageOut] = []
    total = 0.0
    for stage, distance_m in stages_rows:
        distance_m = float(distance_m) if distance_m is not None else None
        total += distance_m or 0.0
        stages.append(
            StageOut(
                id=stage.id,
                ordinal=stage.ordinal,
                name=stage.name,
                geom=to_linestring(stage.geom),
                distance_m=distance_m,
                planned_start_at=stage.planned_start_at,
                planned_duration_s=stage.planned_duration_s,
                assigned_runner=stage.assigned_runner,
            )
        )

    waypoints = [
        WaypointOut(
            id=w.id,
            kind=w.kind,
            name=w.name,
            geom=to_point(w.geom),
            planned_at=w.planned_at,
            notes=w.notes,
        )
        for w in wp_rows
    ]

    return RouteDetail(
        id=route.id,
        event_id=route.event_id,
        name=route.name,
        status=route.status,
        stages=stages,
        waypoints=waypoints,
        total_distance_m=total if stages else None,
    )


async def replace_content(
    session: AsyncSession, route_id: uuid.UUID, payload: RouteReplace
) -> Route:
    route = await session.get(Route, route_id)
    if route is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "route not found")

    await session.execute(delete(Stage).where(Stage.route_id == route_id))
    await session.execute(delete(Waypoint).where(Waypoint.route_id == route_id))

    for stage_in in payload.stages:
        session.add(_stage_from_payload(route_id, stage_in))
    for wp_in in payload.waypoints:
        session.add(_waypoint_from_payload(route_id, wp_in))

    await session.commit()
    await session.refresh(route)
    return route


def _stage_from_payload(route_id: uuid.UUID, s: StageIn) -> Stage:
    return Stage(
        route_id=route_id,
        ordinal=s.ordinal,
        name=s.name,
        geom=linestring_to_wkt(s.geom),
        planned_start_at=s.planned_start_at,
        planned_duration_s=s.planned_duration_s,
        assigned_runner=s.assigned_runner,
    )


def _waypoint_from_payload(route_id: uuid.UUID, w: WaypointIn) -> Waypoint:
    return Waypoint(
        route_id=route_id,
        kind=w.kind,
        name=w.name,
        geom=point_to_wkt(w.geom),
        planned_at=w.planned_at,
        notes=w.notes,
    )
