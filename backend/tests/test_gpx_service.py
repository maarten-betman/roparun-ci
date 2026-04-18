from __future__ import annotations

import pytest

from app.schemas.geojson import LineString, Point
from app.schemas.route import RouteDetail, StageOut, WaypointOut
from app.services.gpx import build_gpx, parse_gpx

GPX_IN = """<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="50.85" lon="4.35"><name>Brussels</name></wpt>
  <trk><name>leg1</name><trkseg>
    <trkpt lat="48.8566" lon="2.3522"/>
    <trkpt lat="50.85" lon="4.35"/>
  </trkseg></trk>
</gpx>"""


def test_parse_gpx_extracts_tracks_and_waypoints() -> None:
    replace = parse_gpx(GPX_IN)
    assert len(replace.stages) == 1
    assert replace.stages[0].ordinal == 0
    assert replace.stages[0].geom.coordinates[0] == (2.3522, 48.8566)
    assert len(replace.waypoints) == 1
    assert replace.waypoints[0].name == "Brussels"


def test_parse_gpx_without_tracks_rejects() -> None:
    empty = (
        """<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"/>"""
    )
    with pytest.raises(ValueError):
        parse_gpx(empty)


def test_build_gpx_round_trip() -> None:
    import uuid

    from app.models.route import RouteStatus
    from app.models.waypoint import WaypointKind

    detail = RouteDetail(
        id=uuid.uuid4(),
        event_id=uuid.uuid4(),
        name="Test",
        status=RouteStatus.draft,
        stages=[
            StageOut(
                id=uuid.uuid4(),
                ordinal=0,
                geom=LineString(coordinates=[(2.35, 48.86), (4.35, 50.85)]),
            )
        ],
        waypoints=[
            WaypointOut(
                id=uuid.uuid4(),
                kind=WaypointKind.handover,
                name="B",
                geom=Point(coordinates=(4.35, 50.85)),
            )
        ],
    )
    xml = build_gpx(detail)
    # Round-trip back through parse_gpx — must yield same coords.
    again = parse_gpx(xml)
    assert again.stages[0].geom.coordinates[0] == (2.35, 48.86)
    assert again.waypoints[0].name == "B"
