"""geo-referenced race photos

Revision ID: 0008_race_photos
Revises: 0007_race_track
Create Date: 2026-05-28

Photos placed on the map by their EXIF GPS tag and revealed on the
replay timeline at capture time. Image bytes live on a media volume;
only filename + metadata are stored here.
"""

from __future__ import annotations

import geoalchemy2 as ga
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0008_race_photos"
down_revision: str | None = "0007_race_track"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "race_photo",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("event.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("filename", sa.String(length=128), nullable=False),
        sa.Column("caption", sa.String(length=300), nullable=True),
        sa.Column("taken_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
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
    op.create_index("ix_race_photo_event_taken", "race_photo", ["event_id", "taken_at"])
    op.execute("CREATE INDEX ix_race_photo_geom ON race_photo USING GIST (geom)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_race_photo_geom")
    op.drop_index("ix_race_photo_event_taken", table_name="race_photo")
    op.drop_table("race_photo")
