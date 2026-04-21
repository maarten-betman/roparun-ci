"""runner hand-over events

Revision ID: 0005_change_events
Revises: 0004_tracking
Create Date: 2026-04-20

Phase 3 — adds deliberate "runner change happened here" annotations posted
by drivers from the tracker PWA. Separate from the raw position stream:
positions are 1 Hz telemetry, change_events are meaningful handover
markers.
"""

from __future__ import annotations

import geoalchemy2 as ga
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0005_change_events"
down_revision: str | None = "0004_tracking"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "change_event",
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
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_change_event_device_ts", "change_event", ["device_id", "ts"])
    op.execute("CREATE INDEX ix_change_event_geom ON change_event USING GIST (geom)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_change_event_geom")
    op.drop_index("ix_change_event_device_ts", table_name="change_event")
    op.drop_table("change_event")
