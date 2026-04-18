"""Seed the database with a demo Conclusion Intelligence Roparun 2026 route.

Usage (inside the api container):
    python -m app.scripts.seed

The route is a coarse Paris → Rotterdam line split into three legs, with
handover waypoints at Brussels, Antwerpen, and Bergen op Zoom. This exists so
the planner and public viewer have something to render immediately after a
fresh `make migrate`.
"""

from __future__ import annotations

import asyncio

from sqlalchemy import select

from ..db import SessionLocal
from ..models import Event, Route, Team
from ..models.route import RouteStatus
from ..models.waypoint import WaypointKind
from ..schemas.geojson import LineString, Point
from ..schemas.route import RouteReplace, StageIn, WaypointIn
from ..services.routes import replace_content

PARIS = (2.3522, 48.8566)
SAINT_QUENTIN = (3.2876, 49.8489)
BRUSSELS = (4.3517, 50.8503)
ANTWERPEN = (4.4024, 51.2194)
BERGEN_OP_ZOOM = (4.2896, 51.4941)
OUD_BEIJERLAND = (4.4111, 51.8237)
ROTTERDAM = (4.4777, 51.9244)


async def seed() -> None:
    async with SessionLocal() as session:
        team = (
            await session.execute(select(Team).where(Team.slug == "conclusion"))
        ).scalar_one_or_none()
        if team is None:
            team = Team(slug="conclusion", name="Conclusion Intelligence", color="#0b3d91")
            session.add(team)
            await session.flush()

        event = (
            await session.execute(select(Event).where(Event.team_id == team.id, Event.year == 2026))
        ).scalar_one_or_none()
        if event is None:
            event = Event(team_id=team.id, year=2026, start_city="Paris")
            session.add(event)
            await session.flush()

        route = (
            await session.execute(select(Route).where(Route.event_id == event.id))
        ).scalar_one_or_none()
        if route is None:
            route = Route(
                event_id=event.id,
                name="Conclusion Roparun 2026",
                status=RouteStatus.published,
            )
            session.add(route)
            await session.flush()
        else:
            route.status = RouteStatus.published

        await session.commit()
        route_id = route.id

    payload = RouteReplace(
        stages=[
            StageIn(
                ordinal=0,
                name="Paris → Brussels",
                assigned_runner="Team A",
                geom=LineString(coordinates=[PARIS, SAINT_QUENTIN, BRUSSELS]),
            ),
            StageIn(
                ordinal=1,
                name="Brussels → Antwerpen",
                assigned_runner="Team B",
                geom=LineString(coordinates=[BRUSSELS, ANTWERPEN]),
            ),
            StageIn(
                ordinal=2,
                name="Antwerpen → Rotterdam",
                assigned_runner="Team C",
                geom=LineString(coordinates=[ANTWERPEN, BERGEN_OP_ZOOM, OUD_BEIJERLAND, ROTTERDAM]),
            ),
        ],
        waypoints=[
            WaypointIn(
                kind=WaypointKind.handover,
                name="Brussels",
                geom=Point(coordinates=BRUSSELS),
            ),
            WaypointIn(
                kind=WaypointKind.handover,
                name="Antwerpen",
                geom=Point(coordinates=ANTWERPEN),
            ),
            WaypointIn(
                kind=WaypointKind.rest,
                name="Bergen op Zoom",
                geom=Point(coordinates=BERGEN_OP_ZOOM),
            ),
        ],
    )

    async with SessionLocal() as session:
        await replace_content(session, route_id, payload)

    print(f"Seeded published route {route_id}")


if __name__ == "__main__":
    asyncio.run(seed())
