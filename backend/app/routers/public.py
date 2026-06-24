from __future__ import annotations

import asyncio
import secrets
import tempfile
from datetime import datetime
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Request,
    Response,
    UploadFile,
    status,
)
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db import get_session
from ..models import Event, RacePhoto, RacePoint, Route, Team
from ..models.route import RouteStatus
from ..schemas.route import RouteDetail
from ..security import REPLAY_COOKIE, replay_authed, require_replay
from ..services.geo import to_point
from ..services.routes import load_route_detail
from ..services.video import transcode_to_mp4

router = APIRouter(prefix="/public", tags=["public"])


class ReplayLogin(BaseModel):
    password: str


@router.get("/replay-status")
async def replay_status(request: Request) -> dict[str, bool]:
    """Tells the replay page whether a password is required and whether the
    caller is already authed (valid cookie)."""
    return {
        "required": bool(get_settings().replay_password),
        "authed": replay_authed(request),
    }


@router.post(
    "/replay-export-transcode",
    dependencies=[Depends(require_replay)],
)
async def replay_export_transcode(file: UploadFile = File(...)) -> Response:
    """Transcode a client-recorded replay (WebM from canvas.captureStream)
    into a broadly-playable H.264 MP4 and return the bytes inline. Sync
    because the user is actively waiting for the download. Capped well
    above any realistic recording; nginx proxy_read_timeout must be set
    high enough to cover the ffmpeg run."""
    raw = await file.read()
    if len(raw) > 500 * 1024 * 1024:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            "exported recording exceeds 500 MB cap",
        )
    if not raw:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "empty upload")
    with tempfile.TemporaryDirectory() as d:
        src = Path(d) / "in.webm"
        dst = Path(d) / "out.mp4"
        src.write_bytes(raw)
        ok, err = await asyncio.to_thread(transcode_to_mp4, src, dst, True)
        if not ok or not dst.exists():
            # Include the ffmpeg stderr tail so the client + browser tools
            # surface the real reason without grepping the api container.
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                f"transcode failed:\n{err[-800:]}",
            )
        data = dst.read_bytes()
    return Response(
        content=data,
        media_type="video/mp4",
        headers={"Content-Disposition": 'attachment; filename="roparun-replay.mp4"'},
    )


@router.post("/replay-login")
async def replay_login(body: ReplayLogin, response: Response) -> dict[str, bool]:
    """Verify the shared replay password and set an HttpOnly cookie that
    same-origin requests (including <img>/<video>) carry automatically."""
    settings = get_settings()
    pw = settings.replay_password
    if not pw:
        return {"ok": True, "required": False}
    if not secrets.compare_digest(body.password, pw):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "wrong password")
    response.set_cookie(
        REPLAY_COOKIE,
        pw,
        max_age=60 * 60 * 24 * 30,
        httponly=True,
        samesite="lax",
        secure=settings.env == "prod",
        path="/",
    )
    return {"ok": True, "required": True}


class RacePointOut(BaseModel):
    seq: int
    name: str
    note: str | None
    kind: int
    position_m: int
    planned_at: datetime | None
    passed_at: datetime
    speed_total_mps: float | None
    speed_actual_mps: float | None
    lng: float
    lat: float


class RaceTrackOut(BaseModel):
    source: str
    points: list[RacePointOut]


class PhotoOut(BaseModel):
    id: str
    kind: str
    status: str
    content_type: str | None
    caption: str | None
    taken_at: datetime | None
    width: int | None
    height: int | None
    lng: float
    lat: float
    url: str


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


@router.get(
    "/{team_slug}/{year}/race-track",
    response_model=RaceTrackOut,
    dependencies=[Depends(require_replay)],
)
async def public_race_track(
    team_slug: str,
    year: int,
    source: str | None = None,
    session: AsyncSession = Depends(get_session),
) -> RaceTrackOut:
    """Recorded official track for race replay. Ordered by passage time.
    `source` selects one import when several exist; defaults to whichever
    has the most points (the primary team track)."""
    event_id = (
        await session.execute(
            select(Event.id)
            .join(Team, Event.team_id == Team.id)
            .where(Team.slug == team_slug, Event.year == year)
        )
    ).scalar_one_or_none()
    if event_id is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "team+year not found")

    stmt = select(RacePoint).where(RacePoint.event_id == event_id)
    if source is not None:
        stmt = stmt.where(RacePoint.source == source)
    stmt = stmt.order_by(RacePoint.passed_at)
    points = list((await session.execute(stmt)).scalars())
    if not points:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no race track for team+year")

    # If no source was requested and multiple exist, keep only the most
    # populous one so the replay shows a single coherent track.
    if source is None:
        counts: dict[str, int] = {}
        for p in points:
            counts[p.source] = counts.get(p.source, 0) + 1
        primary = max(counts, key=lambda s: counts[s])
        points = [p for p in points if p.source == primary]
    else:
        primary = source

    out = []
    for p in points:
        pt = to_point(p.geom)
        lng, lat = pt.coordinates
        out.append(
            RacePointOut(
                seq=p.seq,
                name=p.name,
                note=p.note,
                kind=p.kind,
                position_m=p.position_m,
                planned_at=p.planned_at,
                passed_at=p.passed_at,
                speed_total_mps=p.speed_total_mps,
                speed_actual_mps=p.speed_actual_mps,
                lng=lng,
                lat=lat,
            )
        )
    return RaceTrackOut(source=primary, points=out)


@router.get(
    "/{team_slug}/{year}/photos",
    response_model=list[PhotoOut],
    dependencies=[Depends(require_replay)],
)
async def public_photos(
    team_slug: str,
    year: int,
    session: AsyncSession = Depends(get_session),
) -> list[PhotoOut]:
    """Geo-referenced race photos for the replay, ordered by capture time."""
    event_id = (
        await session.execute(
            select(Event.id)
            .join(Team, Event.team_id == Team.id)
            .where(Team.slug == team_slug, Event.year == year)
        )
    ).scalar_one_or_none()
    if event_id is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "team+year not found")
    stmt = (
        select(RacePhoto)
        .where(RacePhoto.event_id == event_id)
        .order_by(RacePhoto.taken_at.nulls_last(), RacePhoto.created_at)
    )
    out: list[PhotoOut] = []
    for p in (await session.execute(stmt)).scalars():
        pt = to_point(p.geom)
        lng, lat = pt.coordinates
        out.append(
            PhotoOut(
                id=str(p.id),
                kind=p.kind,
                status=p.status,
                content_type=p.content_type,
                caption=p.caption,
                taken_at=p.taken_at,
                width=p.width,
                height=p.height,
                lng=lng,
                lat=lat,
                url=f"media/{p.filename}",
            )
        )
    return out
