"""race media processing status

Revision ID: 0010_race_photo_status
Revises: 0009_race_media
Create Date: 2026-05-28

Adds a `status` column (ready|processing|failed). Videos are transcoded
to H.264 MP4 in the background after upload and sit at "processing"
until done; photos and existing rows are "ready".
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision: str = "0010_race_photo_status"
down_revision: str | None = "0009_race_media"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "race_photo",
        sa.Column("status", sa.String(length=12), nullable=False, server_default="ready"),
    )
    op.alter_column("race_photo", "status", server_default=None)


def downgrade() -> None:
    op.drop_column("race_photo", "status")
