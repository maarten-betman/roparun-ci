from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base
from .base import UUIDPk
from .device import DeviceRole


def _new_pairing_token() -> str:
    """URL-safe token short enough to fit comfortably in a QR code while
    staying unguessable (≈132 bits)."""
    return secrets.token_urlsafe(22)


def _default_expires() -> datetime:
    return datetime.now(UTC) + timedelta(minutes=30)


class PairingToken(UUIDPk, Base):
    """Short-lived token minted by the planner so a phone can pair without
    the crew typing in anything but their own name. Redeemed once via
    POST /devices/from-pairing — that endpoint creates a Device with the
    token's role + event, then marks the token used."""

    __tablename__ = "pairing_token"

    token: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False, default=_new_pairing_token
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("event.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[DeviceRole] = mapped_column(Enum(DeviceRole, name="device_role"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_default_expires
    )
    redeemed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
