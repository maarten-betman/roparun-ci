"""Load an official Roparun per-team tracking export into ``race_point``.

The source file (e.g. ``backend/data/team372.xml``) is the organiser's
recorded track: a flat list of ``<m>`` records — checkpoints and SMS GPS
updates — each with a planned time, an actual passage time, the distance
along the route, reported speeds, and lon/lat.

Quirks handled here:
  - ``Positie`` is in hectometres -> stored as metres (x100).
  - ``SnelheidTotaal`` / ``SnelheidActueel`` are in metres/hour -> stored
    as m/s (divided by 3600) to match the ``position`` table convention.
  - ``Gepland`` is ``DD/MM HH:MM:SS`` (date, no year); ``Doorkomst`` is
    ``HH:MM:SS`` (time only). We stamp the event year, pair the Doorkomst
    time with the Gepland date, and walk the records in route order
    repairing any non-monotonic timestamps (midnight wrap) by adding days.
  - Times are local CEST (UTC+2) for the Whitsun weekend.

Usage (inside the api container):

    python -m app.scripts.load_race_track            # team372.xml → 2026
    python -m app.scripts.load_race_track team500.xml --year 2026

Idempotent: replaces all rows for (event, source) on each run.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import uuid
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone
from pathlib import Path

from geoalchemy2 import WKTElement
from shapely.geometry import Point as ShpPoint  # type: ignore[import-untyped]
from sqlalchemy import delete, select

from ..db import SessionLocal
from ..models import Event, RacePoint, Team

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
# Roparun runs over the Whitsun weekend — CEST, UTC+2 — all year-round here.
CEST = timezone(timedelta(hours=2))


@dataclass
class ParsedPoint:
    seq: int
    name: str
    note: str | None
    kind: int
    position_m: int
    planned_at: datetime | None
    passed_at: datetime
    speed_total_mps: float | None
    speed_actual_mps: float | None
    lon: float
    lat: float


def _text(m: ET.Element, tag: str) -> str | None:
    el = m.find(tag)
    return el.text if el is not None and el.text else None


def _parse_planned(raw: str | None, year: int) -> datetime | None:
    """'23/05 15:00:00' + year → aware datetime (CEST)."""
    if not raw:
        return None
    try:
        date_part, time_part = raw.strip().split(" ", 1)
        day, month = (int(x) for x in date_part.split("/"))
        h, mnt, s = (int(x) for x in time_part.split(":"))
        return datetime(year, month, day, h, mnt, s, tzinfo=CEST)
    except (ValueError, TypeError):
        return None


def _parse_time(raw: str | None) -> time | None:
    if not raw:
        return None
    try:
        h, m, s = (int(x) for x in raw.strip().split(":"))
        return time(h, m, s)
    except (ValueError, TypeError):
        return None


def _mps(raw: str | None) -> float | None:
    """metres/hour string → m/s float."""
    if not raw:
        return None
    try:
        return int(raw) / 3600.0
    except (ValueError, TypeError):
        return None


def _parse_records(path: Path, year: int) -> list[ParsedPoint]:
    tree = ET.parse(path)
    raw: list[tuple[ParsedPoint, time]] = []
    fallback = datetime(year, 5, 23, tzinfo=CEST)
    for m in tree.getroot().findall("m"):
        lon = _text(m, "Lon")
        lat = _text(m, "Lat")
        positie = _text(m, "Positie")
        doorkomst = _parse_time(_text(m, "Doorkomst"))
        if lon is None or lat is None or positie is None or doorkomst is None:
            continue
        planned = _parse_planned(_text(m, "Gepland"), year)
        raw.append(
            (
                ParsedPoint(
                    seq=int(_text(m, "Id") or 0),
                    name=_text(m, "Name") or "?",
                    note=_text(m, "Tekst"),
                    kind=int(_text(m, "Type") or 2),
                    position_m=int(positie) * 100,
                    planned_at=planned,
                    passed_at=fallback,  # provisional, repaired below
                    speed_total_mps=_mps(_text(m, "SnelheidTotaal")),
                    speed_actual_mps=_mps(_text(m, "SnelheidActueel")),
                    lon=float(lon),
                    lat=float(lat),
                ),
                doorkomst,
            )
        )

    # Sort by route position (start → finish) and reconstruct absolute
    # passage timestamps: pair each Doorkomst time with its Gepland date,
    # then walk forward adding whole days wherever the series would
    # otherwise go backwards (i.e. the team crossed midnight).
    raw.sort(key=lambda r: r[0].position_m)
    prev: datetime | None = None
    for point, doorkomst in raw:
        base_date = (point.planned_at or prev or fallback).date()
        passed = datetime.combine(base_date, doorkomst, tzinfo=CEST)
        while prev is not None and passed < prev:
            passed += timedelta(days=1)
        point.passed_at = passed
        prev = passed
    return [p for p, _ in raw]


async def _ensure_event(year: int) -> uuid.UUID:
    async with SessionLocal() as session:
        team = (
            await session.execute(select(Team).where(Team.slug == "conclusion"))
        ).scalar_one_or_none()
        if team is None:
            team = Team(slug="conclusion", name="Conclusion Intelligence", color="#0b3d91")
            session.add(team)
            await session.flush()
        event = (
            await session.execute(select(Event).where(Event.team_id == team.id, Event.year == year))
        ).scalar_one_or_none()
        if event is None:
            event = Event(team_id=team.id, year=year, start_city="Clastres")
            session.add(event)
            await session.flush()
        await session.commit()
        return event.id


async def main() -> None:
    parser = argparse.ArgumentParser(description="Load a Roparun team tracking export.")
    parser.add_argument("file", nargs="?", default="team372.xml", help="XML filename in data/")
    parser.add_argument("--year", type=int, default=2026, help="event year (default 2026)")
    parser.add_argument("--source", default=None, help="source label (default: file stem)")
    args = parser.parse_args()

    path = DATA_DIR / args.file
    if not path.is_file():
        raise SystemExit(f"file not found: {path}")
    source = args.source or path.stem

    rows = _parse_records(path, args.year)
    if not rows:
        raise SystemExit("no usable records parsed — aborting.")
    print(
        f"Parsed {len(rows)} records from {path.name}: "
        f"{rows[0].passed_at:%d/%m %H:%M} → {rows[-1].passed_at:%d/%m %H:%M}, "
        f"{rows[-1].position_m / 1000:.1f} km"
    )

    event_id = await _ensure_event(args.year)
    async with SessionLocal() as session:
        deleted = await session.execute(
            delete(RacePoint).where(RacePoint.event_id == event_id, RacePoint.source == source)
        )
        if deleted.rowcount:  # type: ignore[attr-defined]
            print(f"Replaced {deleted.rowcount} existing '{source}' rows.")  # type: ignore[attr-defined]
        for r in rows:
            session.add(
                RacePoint(
                    event_id=event_id,
                    source=source,
                    seq=r.seq,
                    name=r.name,
                    note=r.note,
                    kind=r.kind,
                    position_m=r.position_m,
                    planned_at=r.planned_at,
                    passed_at=r.passed_at,
                    speed_total_mps=r.speed_total_mps,
                    speed_actual_mps=r.speed_actual_mps,
                    geom=WKTElement(ShpPoint(r.lon, r.lat).wkt, srid=4326),
                )
            )
        await session.commit()
    print(f"Loaded {len(rows)} race points for event {event_id} (source '{source}'). Done.")


if __name__ == "__main__":
    asyncio.run(main())
    sys.exit(0)
