"""routes: team, event, route, stage, waypoint

Revision ID: 0002_routes
Revises: 0001_init_postgis
Create Date: 2026-04-18

"""

from __future__ import annotations

import geoalchemy2 as ga
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0002_routes"
down_revision: str | None = "0001_init_postgis"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "team",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("slug", sa.String(64), nullable=False, unique=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("color", sa.String(16), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )

    op.create_table(
        "event",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "team_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("team.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("year", sa.Integer, nullable=False),
        sa.Column("start_city", sa.String(100), nullable=False, server_default="Paris"),
        sa.Column("start_date", sa.Date, nullable=True),
        sa.Column("end_date", sa.Date, nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("team_id", "year", name="uq_event_team_year"),
    )

    route_status = postgresql.ENUM("draft", "published", name="route_status", create_type=False)
    route_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "route",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("event.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column(
            "status",
            route_status,
            nullable=False,
            server_default="draft",
        ),
        sa.Column(
            "geom",
            ga.Geography(geometry_type="LINESTRING", srid=4326, spatial_index=False),
            nullable=True,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.execute("CREATE INDEX ix_route_geom ON route USING GIST (geom)")

    op.create_table(
        "stage",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "route_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("route.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("ordinal", sa.Integer, nullable=False),
        sa.Column("name", sa.String(200), nullable=True),
        sa.Column(
            "geom",
            ga.Geography(geometry_type="LINESTRING", srid=4326, spatial_index=False),
            nullable=False,
        ),
        sa.Column("distance_m", sa.Float, nullable=True),
        sa.Column("planned_start_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("planned_duration_s", sa.Integer, nullable=True),
        sa.Column("assigned_runner", sa.String(200), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("route_id", "ordinal", name="uq_stage_route_ordinal"),
    )
    op.execute("CREATE INDEX ix_stage_geom ON stage USING GIST (geom)")
    op.create_index("ix_stage_route_id", "stage", ["route_id"])

    waypoint_kind = postgresql.ENUM(
        "handover",
        "rest",
        "checkpoint",
        "hazard",
        "poi",
        name="waypoint_kind",
        create_type=False,
    )
    waypoint_kind.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "waypoint",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "route_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("route.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "kind",
            waypoint_kind,
            nullable=False,
        ),
        sa.Column("name", sa.String(200), nullable=True),
        sa.Column(
            "geom",
            ga.Geography(geometry_type="POINT", srid=4326, spatial_index=False),
            nullable=False,
        ),
        sa.Column("planned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.String(1000), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.execute("CREATE INDEX ix_waypoint_geom ON waypoint USING GIST (geom)")
    op.create_index("ix_waypoint_route_id", "waypoint", ["route_id"])


def downgrade() -> None:
    op.drop_index("ix_waypoint_route_id", table_name="waypoint")
    op.execute("DROP INDEX IF EXISTS ix_waypoint_geom")
    op.drop_table("waypoint")
    op.execute("DROP TYPE IF EXISTS waypoint_kind")

    op.drop_index("ix_stage_route_id", table_name="stage")
    op.execute("DROP INDEX IF EXISTS ix_stage_geom")
    op.drop_table("stage")

    op.execute("DROP INDEX IF EXISTS ix_route_geom")
    op.drop_table("route")
    op.execute("DROP TYPE IF EXISTS route_status")

    op.drop_table("event")
    op.drop_table("team")
