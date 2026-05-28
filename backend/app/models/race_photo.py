from __future__ import annotations

import uuid
from datetime import datetime

from geoalchemy2 import Geography
from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base
from .base import UUIDPk


class RacePhoto(UUIDPk, Base):
    """A geo-referenced photo from the race, placed on the map by its EXIF
    GPS tag and revealed on the replay timeline at its capture time.

    The original is downscaled on upload and written to the media dir
    (a mounted volume in production); only the stored filename + metadata
    live in the DB.
    """

    __tablename__ = "race_photo"

    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("event.id", ondelete="CASCADE"), nullable=False
    )
    # Stored file name within the media dir (uuid + extension). The original
    # client filename is not trusted for the path.
    filename: Mapped[str] = mapped_column(String(128), nullable=False)
    caption: Mapped[str | None] = mapped_column(String(300), nullable=True)
    # EXIF capture time (used to reveal the photo as the replay scrubs past).
    taken_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    geom: Mapped[object] = mapped_column(
        Geography(geometry_type="POINT", srid=4326), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
