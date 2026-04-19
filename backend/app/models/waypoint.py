from __future__ import annotations

import enum
import uuid
from datetime import datetime

from geoalchemy2 import Geography
from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base
from .base import Timestamped, UUIDPk


class WaypointKind(enum.StrEnum):
    handover = "handover"
    rest = "rest"
    checkpoint = "checkpoint"
    hazard = "hazard"
    poi = "poi"


class Waypoint(UUIDPk, Timestamped, Base):
    __tablename__ = "waypoint"

    route_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("route.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[WaypointKind] = mapped_column(
        Enum(WaypointKind, name="waypoint_kind"), nullable=False
    )
    name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    geom: Mapped[object] = mapped_column(
        Geography(geometry_type="POINT", srid=4326), nullable=False
    )
    planned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    # Source-file sub-type (e.g. "checkpoints", "km_markers", "water_stops").
    # `kind` stays as the broad enum for styling, `category` is fine-grained.
    category: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
