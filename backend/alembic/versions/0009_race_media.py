"""race media: video support

Revision ID: 0009_race_media
Revises: 0008_race_photos
Create Date: 2026-05-28

Extends race_photo to hold videos too: a `kind` discriminator
(photo|video) and a `content_type` MIME column. Existing rows backfill
to 'photo'.
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision: str = "0009_race_media"
down_revision: str | None = "0008_race_photos"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "race_photo",
        sa.Column("kind", sa.String(length=8), nullable=False, server_default="photo"),
    )
    op.add_column("race_photo", sa.Column("content_type", sa.String(length=64), nullable=True))
    # Drop the server_default now that existing rows are backfilled; the
    # app supplies kind explicitly on insert.
    op.alter_column("race_photo", "kind", server_default=None)


def downgrade() -> None:
    op.drop_column("race_photo", "content_type")
    op.drop_column("race_photo", "kind")
