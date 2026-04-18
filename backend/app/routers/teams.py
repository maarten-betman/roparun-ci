from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Team
from ..schemas.route import TeamIn, TeamOut

router = APIRouter(prefix="/teams", tags=["teams"])


@router.get("", response_model=list[TeamOut])
async def list_teams(session: AsyncSession = Depends(get_session)) -> list[Team]:
    result = await session.execute(select(Team).order_by(Team.name))
    return list(result.scalars())


@router.post("", response_model=TeamOut, status_code=status.HTTP_201_CREATED)
async def create_team(payload: TeamIn, session: AsyncSession = Depends(get_session)) -> Team:
    team = Team(**payload.model_dump())
    session.add(team)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "slug already exists") from exc
    await session.refresh(team)
    return team


@router.get("/{team_id}", response_model=TeamOut)
async def get_team(team_id: uuid.UUID, session: AsyncSession = Depends(get_session)) -> Team:
    team = await session.get(Team, team_id)
    if team is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "team not found")
    return team
