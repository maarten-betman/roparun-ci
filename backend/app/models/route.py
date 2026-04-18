from __future__ import annotations

import enum
import uuid

from geoalchemy2 import Geography
from sqlalchemy import Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base
from .base import Timestamped, UUIDPk


class RouteStatus(enum.StrEnum):
    draft = "draft"
    published = "published"


class Route(UUIDPk, Timestamped, Base):
    __tablename__ = "route"

    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("event.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[RouteStatus] = mapped_column(
        Enum(RouteStatus, name="route_status"),
        nullable=False,
        default=RouteStatus.draft,
    )
    # Optional full-route geometry; authoritative geometry is the union of stages.
    geom: Mapped[object | None] = mapped_column(
        Geography(geometry_type="LINESTRING", srid=4326), nullable=True
    )
