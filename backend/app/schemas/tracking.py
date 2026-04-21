from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from ..models.device import DeviceRole


class DeviceRegister(BaseModel):
    """Payload for POST /devices — the tracker asks the server to mint a
    device record + bearer token for a given team/year."""

    team_slug: str = Field(min_length=1, max_length=64)
    year: int = Field(ge=1900, le=2100)
    name: str = Field(min_length=1, max_length=120)
    role: DeviceRole = DeviceRole.other


class DeviceCredentials(BaseModel):
    """Returned once at registration. `token` is kept client-side and sent as
    `Authorization: Bearer <token>` on subsequent /ingest calls."""

    id: uuid.UUID
    name: str
    role: DeviceRole
    token: str
    event_id: uuid.UUID


class DeviceOut(BaseModel):
    """Public representation of a device — no token."""

    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    role: DeviceRole
    last_seen_at: datetime | None = None


class PositionIn(BaseModel):
    ts: datetime
    lng: float = Field(ge=-180, le=180)
    lat: float = Field(ge=-90, le=90)
    accuracy_m: float | None = None
    speed_mps: float | None = None
    heading_deg: float | None = None
    battery_pct: float | None = None


class IngestPayload(BaseModel):
    """Tracker PWA flushes a batch of fixes. Batch size bounded so one bad
    request can't stall the server — client chunks if needed."""

    positions: list[PositionIn] = Field(min_length=1, max_length=500)


class LivePoint(BaseModel):
    """Wire shape for current / breadcrumb rendering in the viewer."""

    ts: datetime
    lng: float
    lat: float
    accuracy_m: float | None = None
    speed_mps: float | None = None
    heading_deg: float | None = None
    battery_pct: float | None = None


class LiveDevice(BaseModel):
    """Latest position per device + a short breadcrumb tail."""

    id: uuid.UUID
    name: str
    role: DeviceRole
    last: LivePoint
    breadcrumb: list[LivePoint] = []


class LiveSnapshot(BaseModel):
    devices: list[LiveDevice] = []


class LiveUpdate(BaseModel):
    """WebSocket message: one ingest batch broadcast to listeners."""

    type: str = "positions"
    device_id: uuid.UUID
    name: str
    role: DeviceRole
    positions: list[LivePoint]


class ChangeEventIn(BaseModel):
    """Handover annotation posted by a driver's tracker."""

    ts: datetime
    lng: float = Field(ge=-180, le=180)
    lat: float = Field(ge=-90, le=90)


class ChangeEventOut(BaseModel):
    """Wire shape for /public/…/change-events and the WS broadcast."""

    id: uuid.UUID
    device_id: uuid.UUID
    device_name: str
    ts: datetime
    lng: float
    lat: float


class ChangeEventBroadcast(BaseModel):
    """WebSocket message: a single change event was recorded."""

    type: str = "change_event"
    event: ChangeEventOut
