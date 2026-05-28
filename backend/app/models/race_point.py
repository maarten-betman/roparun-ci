from __future__ import annotations

import uuid
from datetime import datetime

from geoalchemy2 import Geography
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base
from .base import UUIDPk


class RacePoint(UUIDPk, Base):
    """A single recorded waypoint from the official Roparun tracking export
    (the per-team ``team<NNN>.xml`` file: checkpoints + SMS GPS updates with
    passage times, position-along-route, and reported speeds).

    Distinct from ``position`` (live 1 Hz tracker telemetry) — this is the
    sparse, after-the-fact official record used to *replay* a past race.
    ``source`` namespaces one import (e.g. ``"team372"``) so several teams'
    tracks can coexist under one event.
    """

    __tablename__ = "race_point"

    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("event.id", ondelete="CASCADE"), nullable=False
    )
    source: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    # Original record ordering from the source file (Id). Not used for sort
    # — passed_at is authoritative — but kept for traceability.
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    note: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # 0 = start, 1 = checkpoint, 2 = SMS/GPS update (source "Type" field).
    kind: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    # Distance along the route in meters (source "Positie" is hectometres).
    position_m: Mapped[int] = mapped_column(Integer, nullable=False)
    planned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Reconstructed absolute passage time (source "Doorkomst" is time-only;
    # the date comes from "Gepland", repaired for monotonicity).
    passed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # Reported speeds, stored as m/s (source is m/h). "total" = average since
    # start, "actual" = instantaneous at the report.
    speed_total_mps: Mapped[float | None] = mapped_column(Float, nullable=True)
    speed_actual_mps: Mapped[float | None] = mapped_column(Float, nullable=True)
    geom: Mapped[object] = mapped_column(
        Geography(geometry_type="POINT", srid=4326), nullable=False
    )
