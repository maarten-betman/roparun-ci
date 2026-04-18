from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import PlainTextResponse
from gpxpy.gpx import GPXException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Route
from ..schemas.route import RouteDetail, RouteIn, RouteReplace, RouteSummary
from ..services.gpx import build_gpx, parse_gpx
from ..services.routes import load_route_detail, replace_content

router = APIRouter(prefix="/routes", tags=["routes"])


@router.get("", response_model=list[RouteSummary])
async def list_routes(
    event_id: uuid.UUID | None = None,
    session: AsyncSession = Depends(get_session),
) -> list[Route]:
    stmt = select(Route).order_by(Route.created_at.desc())
    if event_id is not None:
        stmt = stmt.where(Route.event_id == event_id)
    result = await session.execute(stmt)
    return list(result.scalars())


@router.post("", response_model=RouteSummary, status_code=status.HTTP_201_CREATED)
async def create_route(payload: RouteIn, session: AsyncSession = Depends(get_session)) -> Route:
    route = Route(**payload.model_dump())
    session.add(route)
    await session.commit()
    await session.refresh(route)
    return route


@router.get("/{route_id}", response_model=RouteDetail)
async def get_route(
    route_id: uuid.UUID, session: AsyncSession = Depends(get_session)
) -> RouteDetail:
    route = await session.get(Route, route_id)
    if route is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "route not found")
    return await load_route_detail(session, route)


@router.put("/{route_id}/content", response_model=RouteDetail)
async def replace_route_content(
    route_id: uuid.UUID,
    payload: RouteReplace,
    session: AsyncSession = Depends(get_session),
) -> RouteDetail:
    route = await replace_content(session, route_id, payload)
    return await load_route_detail(session, route)


@router.delete("/{route_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_route(route_id: uuid.UUID, session: AsyncSession = Depends(get_session)) -> None:
    route = await session.get(Route, route_id)
    if route is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "route not found")
    await session.delete(route)
    await session.commit()


@router.post("/{route_id}/gpx", response_model=RouteDetail)
async def upload_gpx(
    route_id: uuid.UUID,
    file: UploadFile,
    session: AsyncSession = Depends(get_session),
) -> RouteDetail:
    raw = (await file.read()).decode("utf-8", errors="replace")
    try:
        payload = parse_gpx(raw)
    except (ValueError, GPXException) as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"invalid GPX: {exc}") from exc
    route = await replace_content(session, route_id, payload)
    return await load_route_detail(session, route)


@router.get("/{route_id}/gpx", response_class=PlainTextResponse)
async def download_gpx(
    route_id: uuid.UUID, session: AsyncSession = Depends(get_session)
) -> PlainTextResponse:
    route = await session.get(Route, route_id)
    if route is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "route not found")
    detail = await load_route_detail(session, route)
    return PlainTextResponse(
        build_gpx(detail),
        media_type="application/gpx+xml",
        headers={"Content-Disposition": f'attachment; filename="{route.name}.gpx"'},
    )
