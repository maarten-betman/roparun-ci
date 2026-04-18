"""enable postgis extension

Revision ID: 0001_init_postgis
Revises:
Create Date: 2026-04-18

"""
from __future__ import annotations

from alembic import op

revision: str = "0001_init_postgis"
down_revision: str | None = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")


def downgrade() -> None:
    op.execute("DROP EXTENSION IF EXISTS postgis")
