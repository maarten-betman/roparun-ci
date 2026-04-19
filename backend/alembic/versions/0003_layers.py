"""layers: stage.layer, waypoint.category

Revision ID: 0003_layers
Revises: 0002_routes
Create Date: 2026-04-19

Adds optional free-form classifiers to support multi-layer routes where a
single Roparun route carries many overlays (runners track, per-vehicle
allowed/forbidden/detour, and 14+ POI categories). `kind` on waypoint stays
as the broad enum for styling; `category` captures the source-file label.
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision: str = "0003_layers"
down_revision: str | None = "0002_routes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("stage", sa.Column("layer", sa.String(64), nullable=True))
    op.create_index("ix_stage_layer", "stage", ["layer"])

    op.add_column("waypoint", sa.Column("category", sa.String(64), nullable=True))
    op.create_index("ix_waypoint_category", "waypoint", ["category"])


def downgrade() -> None:
    op.drop_index("ix_waypoint_category", table_name="waypoint")
    op.drop_column("waypoint", "category")

    op.drop_index("ix_stage_layer", table_name="stage")
    op.drop_column("stage", "layer")
