"""Minimal GeoJSON geometry schemas (RFC 7946) for LineString and Point.

We deliberately keep these narrow — we only accept the two geometry types we use.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field

Lon = Annotated[float, Field(ge=-180, le=180)]
Lat = Annotated[float, Field(ge=-90, le=90)]
Position = tuple[Lon, Lat]


class LineString(BaseModel):
    type: Literal["LineString"] = "LineString"
    coordinates: Annotated[list[Position], Field(min_length=2)]


class Point(BaseModel):
    type: Literal["Point"] = "Point"
    coordinates: Position
