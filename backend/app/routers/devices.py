from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Device, Event, PairingToken, Team
from ..schemas.tracking import (
    DeviceCredentials,
    DeviceFromPairing,
    DeviceRegister,
    PairingTokenCreate,
    PairingTokenOut,
)

router = APIRouter(tags=["tracking"])


@router.post("/devices", response_model=DeviceCredentials, status_code=status.HTTP_201_CREATED)
async def register_device(
    payload: DeviceRegister, session: AsyncSession = Depends(get_session)
) -> DeviceCredentials:
    """Mint a new device + bearer token bound to a team+year event.

    Idempotency is intentionally not provided: every call creates a fresh
    device. Lost tokens mean registering a new device; old positions remain
    attributed to the old row.
    """
    event = await _resolve_event(session, payload.team_slug, payload.year)
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "team+year not found")

    device = Device(event_id=event.id, name=payload.name, role=payload.role)
    session.add(device)
    await session.commit()
    await session.refresh(device)
    return DeviceCredentials(
        id=device.id,
        name=device.name,
        role=device.role,
        token=device.token,
        event_id=device.event_id,
    )


@router.post(
    "/pairing-tokens",
    response_model=PairingTokenOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_pairing_token(
    payload: PairingTokenCreate, session: AsyncSession = Depends(get_session)
) -> PairingTokenOut:
    """Mint a short-lived pairing token for a given role.

    The planner renders this as a QR code + URL. A phone that visits
    `/tracker.html?pair=<token>` then asks for just a name and redeems
    via `POST /devices/from-pairing`.
    """
    event = await _resolve_event(session, payload.team_slug, payload.year)
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "team+year not found")

    pt = PairingToken(event_id=event.id, role=payload.role)
    session.add(pt)
    await session.commit()
    await session.refresh(pt)
    return PairingTokenOut(
        token=pt.token,
        role=pt.role,
        expires_at=pt.expires_at,
        url_path=f"/tracker.html?pair={pt.token}",
    )


@router.post(
    "/devices/from-pairing",
    response_model=DeviceCredentials,
    status_code=status.HTTP_201_CREATED,
)
async def redeem_pairing_token(
    payload: DeviceFromPairing, session: AsyncSession = Depends(get_session)
) -> DeviceCredentials:
    """Redeem a pairing token into a persistent Device + bearer token.

    The pairing token is single-use: we stamp `redeemed_at` in the same
    transaction we create the device, so a replay of the same token is
    rejected with 409.
    """
    stmt = select(PairingToken).where(PairingToken.token == payload.token)
    pt = (await session.execute(stmt)).scalar_one_or_none()
    if pt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "unknown pairing token")
    now = datetime.now(UTC)
    if pt.redeemed_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "pairing token already used")
    if pt.expires_at < now:
        raise HTTPException(status.HTTP_410_GONE, "pairing token expired")

    device = Device(event_id=pt.event_id, name=payload.name, role=pt.role)
    session.add(device)
    pt.redeemed_at = now
    await session.commit()
    await session.refresh(device)
    return DeviceCredentials(
        id=device.id,
        name=device.name,
        role=device.role,
        token=device.token,
        event_id=device.event_id,
    )


async def _resolve_event(session: AsyncSession, team_slug: str, year: int) -> Event | None:
    stmt = (
        select(Event)
        .join(Team, Team.id == Event.team_id)
        .where(Team.slug == team_slug, Event.year == year)
    )
    return (await session.execute(stmt)).scalar_one_or_none()
