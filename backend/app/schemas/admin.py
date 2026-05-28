"""DTOs for the /admin/* router.

Reuse-first: most listing endpoints return the existing TeamOut / EventOut /
RouteSummary / WaypointOut shapes. The types here cover only the bits that
don't fit those — PATCH bodies, cleanup-action bodies, paginated
envelopes for high-volume tables, and aggregate stats.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from ..models.device import DeviceRole
from ..models.route import RouteStatus
from ..models.waypoint import WaypointKind


class RoutePatch(BaseModel):
    """All fields optional; only the present ones are applied."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    status: RouteStatus | None = None


class TeamPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    color: str | None = None


class EventPatch(BaseModel):
    start_city: str | None = Field(default=None, min_length=1, max_length=100)
    start_date: date | None = None
    end_date: date | None = None


class DevicePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    role: DeviceRole | None = None


class WaypointPatch(BaseModel):
    """Metadata-only: deliberately no geom field. Use the planner / GPX
    upload to edit geometry."""

    name: str | None = None
    kind: WaypointKind | None = None
    category: str | None = Field(default=None, max_length=64)
    notes: str | None = Field(default=None, max_length=1000)
    planned_at: datetime | None = None


class DeviceAdminOut(BaseModel):
    """Device row enriched with operator-relevant counts/timestamps."""

    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    event_id: uuid.UUID
    name: str
    role: DeviceRole
    created_at: datetime
    last_seen_at: datetime | None
    position_count: int
    change_event_count: int


class RotateTokenOut(BaseModel):
    token: str


class PositionOut(BaseModel):
    id: uuid.UUID
    device_id: uuid.UUID
    ts: datetime
    lng: float
    lat: float
    accuracy_m: float | None
    speed_mps: float | None
    heading_deg: float | None
    battery_pct: float | None


class PositionPage(BaseModel):
    """Cursor-paginated. `next_cursor` is None when there are no more rows."""

    items: list[PositionOut]
    next_cursor: str | None


class ChangeEventOut(BaseModel):
    id: uuid.UUID
    device_id: uuid.UUID
    device_name: str
    ts: datetime
    lng: float
    lat: float


class ChangeEventPage(BaseModel):
    items: list[ChangeEventOut]
    total: int


class CleanupPositionsBody(BaseModel):
    event_id: uuid.UUID
    older_than: datetime


class CleanupOrphanBody(BaseModel):
    event_id: uuid.UUID


class CleanupPairingBody(BaseModel):
    event_id: uuid.UUID


class CleanupResult(BaseModel):
    deleted: int


class Stats(BaseModel):
    event_id: uuid.UUID
    routes: int
    devices: int
    positions: int
    positions_24h: int
    change_events: int
    waypoints: int


class PhotoOut(BaseModel):
    id: uuid.UUID
    kind: str
    content_type: str | None
    caption: str | None
    taken_at: datetime | None
    width: int | None
    height: int | None
    lng: float
    lat: float
    url: str
