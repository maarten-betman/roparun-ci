from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from ..models.route import RouteStatus
from ..models.waypoint import WaypointKind
from .geojson import LineString, Point


class TeamIn(BaseModel):
    slug: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=200)
    color: str | None = None


class TeamOut(TeamIn):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID


class EventIn(BaseModel):
    team_id: uuid.UUID
    year: int
    start_city: str = "Paris"
    start_date: date | None = None
    end_date: date | None = None


class EventOut(EventIn):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID


class StageIn(BaseModel):
    ordinal: int = Field(ge=0)
    name: str | None = None
    geom: LineString
    planned_start_at: datetime | None = None
    planned_duration_s: int | None = Field(default=None, ge=0)
    assigned_runner: str | None = None


class StageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    ordinal: int
    name: str | None = None
    geom: LineString
    distance_m: float | None = None
    planned_start_at: datetime | None = None
    planned_duration_s: int | None = None
    assigned_runner: str | None = None


class WaypointIn(BaseModel):
    kind: WaypointKind
    name: str | None = None
    geom: Point
    planned_at: datetime | None = None
    notes: str | None = None


class WaypointOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    kind: WaypointKind
    name: str | None = None
    geom: Point
    planned_at: datetime | None = None
    notes: str | None = None


class RouteIn(BaseModel):
    event_id: uuid.UUID
    name: str = Field(min_length=1, max_length=200)
    status: RouteStatus = RouteStatus.draft


class RouteSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    event_id: uuid.UUID
    name: str
    status: RouteStatus


class RouteDetail(RouteSummary):
    stages: list[StageOut] = []
    waypoints: list[WaypointOut] = []
    total_distance_m: float | None = None


class RouteReplace(BaseModel):
    """Full write: replaces all stages and waypoints for a route."""

    stages: list[StageIn]
    waypoints: list[WaypointIn] = []
