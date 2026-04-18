"""GPX import/export.

Import: each <trkseg> becomes one stage. <wpt> elements become waypoints (kind=poi).
Export: stages become ordered track segments; waypoints become <wpt> entries.
"""

from __future__ import annotations

import gpxpy
import gpxpy.gpx

from ..models.waypoint import WaypointKind
from ..schemas.geojson import LineString, Point
from ..schemas.route import RouteDetail, RouteReplace, StageIn, WaypointIn


def parse_gpx(data: str) -> RouteReplace:
    gpx = gpxpy.parse(data)
    stages: list[StageIn] = []
    ordinal = 0
    for track in gpx.tracks:
        for segment in track.segments:
            coords = [(p.longitude, p.latitude) for p in segment.points]
            if len(coords) < 2:
                continue
            stages.append(
                StageIn(
                    ordinal=ordinal,
                    name=track.name,
                    geom=LineString(coordinates=coords),
                )
            )
            ordinal += 1

    waypoints: list[WaypointIn] = [
        WaypointIn(
            kind=WaypointKind.poi,
            name=wp.name,
            geom=Point(coordinates=(wp.longitude, wp.latitude)),
            notes=wp.description,
        )
        for wp in gpx.waypoints
    ]

    if not stages:
        raise ValueError("GPX contains no track segments with >= 2 points")
    return RouteReplace(stages=stages, waypoints=waypoints)


def build_gpx(detail: RouteDetail) -> str:
    gpx = gpxpy.gpx.GPX()
    gpx.name = detail.name

    track = gpxpy.gpx.GPXTrack(name=detail.name)
    gpx.tracks.append(track)
    for stage in detail.stages:
        seg = gpxpy.gpx.GPXTrackSegment()
        for lon, lat in stage.geom.coordinates:
            seg.points.append(gpxpy.gpx.GPXTrackPoint(latitude=lat, longitude=lon))
        track.segments.append(seg)

    for wp in detail.waypoints:
        lon, lat = wp.geom.coordinates
        gpx.waypoints.append(
            gpxpy.gpx.GPXWaypoint(
                latitude=lat,
                longitude=lon,
                name=wp.name,
                description=wp.notes,
                type=wp.kind.value,
            )
        )

    return gpx.to_xml()
