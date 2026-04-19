from __future__ import annotations

import uuid
from datetime import datetime

from geoalchemy2 import Geography
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base
from .base import Timestamped, UUIDPk


class Stage(UUIDPk, Timestamped, Base):
    __tablename__ = "stage"
    __table_args__ = (UniqueConstraint("route_id", "ordinal", name="uq_stage_route_ordinal"),)

    route_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("route.id", ondelete="CASCADE"), nullable=False
    )
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Polyline for this leg. GEOGRAPHY so PostGIS handles distances in metres.
    geom: Mapped[object] = mapped_column(
        Geography(geometry_type="LINESTRING", srid=4326), nullable=False
    )
    distance_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    planned_start_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    planned_duration_s: Mapped[int | None] = mapped_column(Integer, nullable=True)
    assigned_runner: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Overlay group: "runners", "vehicle_b", etc. Lets one route carry
    # multiple parallel tracks that render as distinct layers on the map.
    layer: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
