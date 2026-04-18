from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Event, Route, Team
from ..models.route import RouteStatus
from ..schemas.route import RouteDetail
from ..services.routes import load_route_detail

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/{team_slug}/{year}", response_model=RouteDetail)
async def public_route(
    team_slug: str,
    year: int,
    session: AsyncSession = Depends(get_session),
) -> RouteDetail:
    stmt = (
        select(Route)
        .join(Event, Route.event_id == Event.id)
        .join(Team, Event.team_id == Team.id)
        .where(
            Team.slug == team_slug,
            Event.year == year,
            Route.status == RouteStatus.published,
        )
        .order_by(Route.created_at.desc())
        .limit(1)
    )
    route = (await session.execute(stmt)).scalars().first()
    if route is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no published route for team+year")
    return await load_route_detail(session, route)
