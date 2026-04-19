"""Load the official Roparun 2026 V3 route set into the DB.

Reads the 24 GPX files under ``backend/data/gpx/2026/`` and builds a single
``Route`` named "Roparun 2026 V3" for team ``conclusion`` / event 2026.

Only two files carry actual tracks (``<trkseg>``): the runners line and the
B-vehicle line. Everything else is a pure waypoint set — even the per-vehicle
"toegestaan/verboden" overlays are represented as dense point clouds in the
source data. The loader maps each filename to a (kind, category) pair so we
can style and filter them on the map.

Usage (inside the api container):

    python -m app.scripts.load_roparun_2026

Idempotent: running twice replaces the route's content each time.
"""

from __future__ import annotations

import asyncio
import sys
import uuid
from pathlib import Path

import gpxpy
from sqlalchemy import select

from ..db import SessionLocal
from ..models import Event, Route, Team
from ..models.route import RouteStatus
from ..models.waypoint import WaypointKind
from ..schemas.geojson import LineString, Point
from ..schemas.route import RouteReplace, StageIn, WaypointIn
from ..services.routes import replace_content

# The canonical source set ships as files under backend/data/gpx/2026/.
# In the api container the backend/ dir is the working directory so the path
# resolves to /app/data/gpx/2026/. We anchor on this file's location instead
# of CWD so `python -m app.scripts.load_roparun_2026` works from anywhere.
DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "gpx" / "2026"

# Filename descriptor (with "2026V3 - " prefix and " - Frankrijk - Roparun.gpx"
# suffix stripped) → overlay layer name for track files.
TRACK_LAYERS: dict[str, str] = {
    "Lopers track": "runners",
    "B Voertuig track": "vehicle_b",
}

# Filename descriptor → (WaypointKind, category slug) for waypoint-only files.
# The broad `kind` drives marker styling; `category` keeps the source label
# for filter UIs later.
WAYPOINT_KINDS: dict[str, tuple[WaypointKind, str]] = {
    "Checkpoints": (WaypointKind.checkpoint, "checkpoints"),
    "Doorkomsten ed": (WaypointKind.checkpoint, "passages"),
    "Wisselplaatsen": (WaypointKind.handover, "handovers"),
    "Samenvoegingen lopers-busjes": (WaypointKind.handover, "merges_runners_vans"),
    "Splitsingen lopers-busjes": (WaypointKind.handover, "splits_runners_vans"),
    "Slaapplaatsen organisatie": (WaypointKind.rest, "sleeping_org"),
    "Toiletten": (WaypointKind.rest, "toilets"),
    "Waterplaatsen bij hitteprotocol": (WaypointKind.rest, "water_stops_heat_protocol"),
    "Gevaarlijke plaatsen": (WaypointKind.hazard, "hazards"),
    "Aankondigingen onverhard stuk": (WaypointKind.hazard, "unpaved_announcements"),
    "KM punten": (WaypointKind.poi, "km_markers"),
    "Lopers routepunten": (WaypointKind.poi, "runner_route_points"),
    "Milieuplaatsen": (WaypointKind.poi, "environmental"),
    "A voertuig - Toegestaan": (WaypointKind.poi, "vehicle_a_allowed"),
    "A voertuig - Verboden": (WaypointKind.poi, "vehicle_a_forbidden"),
    "B voertuig - Toegestaan": (WaypointKind.poi, "vehicle_b_allowed"),
    "B voertuig - Verboden": (WaypointKind.poi, "vehicle_b_forbidden"),
    "B voertuig - Niet stoppen": (WaypointKind.poi, "vehicle_b_no_stop"),
    "B voertuig - Omleiding": (WaypointKind.poi, "vehicle_b_detour"),
    "C voertuig - Toegestaan": (WaypointKind.poi, "vehicle_c_allowed"),
    "C voertuig - Verboden": (WaypointKind.poi, "vehicle_c_forbidden"),
    "C voertuig - Niet op route": (WaypointKind.poi, "vehicle_c_off_route"),
}

_PREFIX = "2026V3 - "
_SUFFIX = " - Frankrijk - Roparun.gpx"


def _descriptor(path: Path) -> str:
    name = path.name
    if name.startswith(_PREFIX):
        name = name[len(_PREFIX) :]
    if name.endswith(_SUFFIX):
        name = name[: -len(_SUFFIX)]
    return name


def _parse_file(path: Path, next_ordinal: int) -> tuple[list[StageIn], list[WaypointIn], int]:
    """Parse one GPX file and return (stages, waypoints, new next_ordinal)."""
    desc = _descriptor(path)
    with path.open("r", encoding="utf-8-sig") as fp:
        gpx = gpxpy.parse(fp)

    stages: list[StageIn] = []
    waypoints: list[WaypointIn] = []

    layer = TRACK_LAYERS.get(desc)
    if layer is not None:
        # Track file: each segment becomes one stage under the shared layer.
        for track in gpx.tracks:
            for segment in track.segments:
                coords = [(p.longitude, p.latitude) for p in segment.points]
                if len(coords) < 2:
                    continue
                stages.append(
                    StageIn(
                        ordinal=next_ordinal,
                        name=track.name or desc,
                        geom=LineString(coordinates=coords),
                        layer=layer,
                    )
                )
                next_ordinal += 1
        return stages, waypoints, next_ordinal

    mapping = WAYPOINT_KINDS.get(desc)
    if mapping is None:
        print(f"  ! unknown descriptor, skipping: {desc!r}", file=sys.stderr)
        return stages, waypoints, next_ordinal

    kind, category = mapping
    for wp in gpx.waypoints:
        waypoints.append(
            WaypointIn(
                kind=kind,
                name=wp.name,
                geom=Point(coordinates=(wp.longitude, wp.latitude)),
                notes=wp.description,
                category=category,
            )
        )
    return stages, waypoints, next_ordinal


async def _ensure_route() -> tuple[uuid.UUID, bool]:
    """Make sure team/event/route exist, return (route_id, created_now)."""
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
            event = Event(team_id=team.id, year=2026, start_city="Clastres")
            session.add(event)
            await session.flush()

        route = (
            await session.execute(
                select(Route).where(Route.event_id == event.id, Route.name == "Roparun 2026 V3")
            )
        ).scalar_one_or_none()
        created = False
        if route is None:
            route = Route(
                event_id=event.id,
                name="Roparun 2026 V3",
                status=RouteStatus.published,
            )
            session.add(route)
            created = True
        else:
            # Re-publish on subsequent loads in case it was demoted to draft.
            route.status = RouteStatus.published

        await session.commit()
        return route.id, created


async def main() -> None:
    if not DATA_DIR.is_dir():
        raise SystemExit(f"GPX source directory not found: {DATA_DIR}")

    files = sorted(DATA_DIR.glob("*.gpx"))
    print(f"Loading {len(files)} GPX files from {DATA_DIR}")

    all_stages: list[StageIn] = []
    all_waypoints: list[WaypointIn] = []
    next_ordinal = 0
    for path in files:
        stages, waypoints, next_ordinal = _parse_file(path, next_ordinal)
        print(f"  {path.name}: +{len(stages)} stages, +{len(waypoints)} waypoints")
        all_stages.extend(stages)
        all_waypoints.extend(waypoints)

    if not all_stages and not all_waypoints:
        raise SystemExit("No data parsed from GPX files — aborting.")

    route_id, created = await _ensure_route()
    print(
        f"{'Created' if created else 'Updating'} route {route_id} "
        f"with {len(all_stages)} stages and {len(all_waypoints)} waypoints"
    )

    async with SessionLocal() as session:
        await replace_content(
            session, route_id, RouteReplace(stages=all_stages, waypoints=all_waypoints)
        )
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
