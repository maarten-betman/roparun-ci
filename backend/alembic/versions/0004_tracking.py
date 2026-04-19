"""tracking: device, position

Revision ID: 0004_tracking
Revises: 0003_layers
Create Date: 2026-04-19

Phase 3 — live tracking. `device` is a tracker (phone/GPS unit) bound to an
event; its `token` is the bearer the PWA uses to POST /ingest. `position` is
a high-volume append-only stream (GPS fixes), indexed on time (BRIN) and
space (GIST).
"""

from __future__ import annotations

import geoalchemy2 as ga
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0004_tracking"
down_revision: str | None = "0003_layers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    device_role = postgresql.ENUM(
        "runner",
        "cyclist",
        "driver",
        "medic",
        "other",
        name="device_role",
        create_type=False,
    )
    device_role.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "device",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("event.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("role", device_role, nullable=False, server_default="other"),
        sa.Column("token", sa.String(64), nullable=False, unique=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_device_event_id", "device", ["event_id"])

    op.create_table(
        "position",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "device_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("device.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "geom",
            ga.Geography(geometry_type="POINT", srid=4326, spatial_index=False),
            nullable=False,
        ),
        sa.Column("accuracy_m", sa.Float, nullable=True),
        sa.Column("speed_mps", sa.Float, nullable=True),
        sa.Column("heading_deg", sa.Float, nullable=True),
        sa.Column("battery_pct", sa.Float, nullable=True),
    )
    op.create_index("ix_position_device_ts", "position", ["device_id", "ts"])
    # BRIN on ts: positions arrive roughly in time-order, so BRIN gives a tiny
    # index (~kB) with good range-scan selectivity for "recent N minutes" style
    # queries. GIST on geom for spatial lookups.
    op.execute("CREATE INDEX ix_position_ts_brin ON position USING BRIN (ts)")
    op.execute("CREATE INDEX ix_position_geom ON position USING GIST (geom)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_position_geom")
    op.execute("DROP INDEX IF EXISTS ix_position_ts_brin")
    op.drop_index("ix_position_device_ts", table_name="position")
    op.drop_table("position")

    op.drop_index("ix_device_event_id", table_name="device")
    op.drop_table("device")
    op.execute("DROP TYPE IF EXISTS device_role")
