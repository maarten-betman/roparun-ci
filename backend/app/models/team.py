from __future__ import annotations

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base
from .base import Timestamped, UUIDPk


class Team(UUIDPk, Timestamped, Base):
    __tablename__ = "team"

    slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    color: Mapped[str | None] = mapped_column(String(16), nullable=True)
