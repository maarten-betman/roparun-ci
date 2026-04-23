"""pairing tokens

Revision ID: 0006_pairing_tokens
Revises: 0005_change_events
Create Date: 2026-04-20

Short-lived tokens minted by the planner so phones can pair via QR-scan
instead of hand-typing name/role/team/year.
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0006_pairing_tokens"
down_revision: str | None = "0005_change_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "pairing_token",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("token", sa.String(64), nullable=False, unique=True),
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("event.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # `device_role` enum was introduced by migration 0004 — reuse it.
        sa.Column(
            "role",
            sa.Enum(
                "runner",
                "cyclist",
                "driver",
                "medic",
                "other",
                name="device_role",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("redeemed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_pairing_token_event_id", "pairing_token", ["event_id"])


def downgrade() -> None:
    op.drop_index("ix_pairing_token_event_id", table_name="pairing_token")
    op.drop_table("pairing_token")
