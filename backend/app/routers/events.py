from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Event
from ..schemas.route import EventIn, EventOut

router = APIRouter(prefix="/events", tags=["events"])


@router.get("", response_model=list[EventOut])
async def list_events(
    team_id: uuid.UUID | None = None,
    session: AsyncSession = Depends(get_session),
) -> list[Event]:
    stmt = select(Event).order_by(Event.year.desc())
    if team_id is not None:
        stmt = stmt.where(Event.team_id == team_id)
    result = await session.execute(stmt)
    return list(result.scalars())


@router.post("", response_model=EventOut, status_code=status.HTTP_201_CREATED)
async def create_event(payload: EventIn, session: AsyncSession = Depends(get_session)) -> Event:
    event = Event(**payload.model_dump())
    session.add(event)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "event already exists for team+year") from exc
    await session.refresh(event)
    return event
