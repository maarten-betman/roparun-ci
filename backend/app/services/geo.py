"""Conversions between GeoJSON schemas, WKT strings, and PostGIS geography."""

from __future__ import annotations

from typing import Any

from geoalchemy2 import WKTElement
from geoalchemy2.shape import to_shape
from shapely.geometry import (  # type: ignore[import-untyped]
    LineString as ShpLine,
)
from shapely.geometry import (
    Point as ShpPoint,
)

from ..schemas.geojson import LineString, Point


def linestring_to_wkt(ls: LineString) -> WKTElement:
    shp = ShpLine([(lon, lat) for lon, lat in ls.coordinates])
    return WKTElement(shp.wkt, srid=4326)


def point_to_wkt(p: Point) -> WKTElement:
    lon, lat = p.coordinates
    return WKTElement(ShpPoint(lon, lat).wkt, srid=4326)


def to_linestring(geom: Any) -> LineString:
    shp = to_shape(geom)
    return LineString(coordinates=[(x, y) for x, y in shp.coords])


def to_point(geom: Any) -> Point:
    shp = to_shape(geom)
    return Point(coordinates=(shp.x, shp.y))
