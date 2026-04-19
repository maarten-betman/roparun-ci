from __future__ import annotations

import enum
import secrets
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base
from .base import Timestamped, UUIDPk


class DeviceRole(enum.StrEnum):
    runner = "runner"
    cyclist = "cyclist"
    driver = "driver"
    medic = "medic"
    other = "other"


def _new_token() -> str:
    """48-char URL-safe bearer token — used by the tracker PWA to authenticate
    `POST /ingest`. Not a rotatable auth system; adequate for Phase 3 until
    QR pairing + magic-link auth lands in Phase 3.5."""
    return secrets.token_urlsafe(36)


class Device(UUIDPk, Timestamped, Base):
    __tablename__ = "device"

    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("event.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    role: Mapped[DeviceRole] = mapped_column(
        Enum(DeviceRole, name="device_role"), nullable=False, default=DeviceRole.other
    )
    token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, default=_new_token)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
