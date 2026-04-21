from __future__ import annotations

import uuid
from datetime import datetime

from geoalchemy2 import Geography
from sqlalchemy import DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base
from .base import UUIDPk


class ChangeEvent(UUIDPk, Base):
    """Runner hand-over, reported by a driver from the tracker PWA.

    Separate from `position` — positions are 1 Hz GPS fixes, change events
    are deliberate "we just swapped runners" annotations. One row per
    hand-over. The driver taps a big button in the driver view; the client
    sends its best lng/lat/ts for the moment the tap happened.
    """

    __tablename__ = "change_event"

    device_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("device.id", ondelete="CASCADE"), nullable=False
    )
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    geom: Mapped[object] = mapped_column(
        Geography(geometry_type="POINT", srid=4326), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
