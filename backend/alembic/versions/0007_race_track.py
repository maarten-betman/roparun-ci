"""official race-track replay points

Revision ID: 0007_race_track
Revises: 0006_pairing_tokens
Create Date: 2026-05-28

Stores the official Roparun per-team tracking export (team<NNN>.xml):
sparse checkpoints + SMS GPS updates with passage times, position along
the route, and reported speeds. Powers the race-replay page. Separate
from `position` (live 1 Hz telemetry).
"""

from __future__ import annotations

import geoalchemy2 as ga
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0007_race_track"
down_revision: str | None = "0006_pairing_tokens"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "race_point",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("event.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("source", sa.String(length=64), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("note", sa.String(length=200), nullable=True),
        sa.Column("kind", sa.Integer(), nullable=False),
        sa.Column("position_m", sa.Integer(), nullable=False),
        sa.Column("planned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("passed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("speed_total_mps", sa.Float(), nullable=True),
        sa.Column("speed_actual_mps", sa.Float(), nullable=True),
        sa.Column(
            "geom",
            ga.Geography(geometry_type="POINT", srid=4326, spatial_index=False),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_race_point_event_source_passed",
        "race_point",
        ["event_id", "source", "passed_at"],
    )
    op.execute("CREATE INDEX ix_race_point_geom ON race_point USING GIST (geom)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_race_point_geom")
    op.drop_index("ix_race_point_event_source_passed", table_name="race_point")
    op.drop_table("race_point")
