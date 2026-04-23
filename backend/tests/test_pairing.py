from __future__ import annotations

from datetime import UTC, datetime, timedelta

from httpx import AsyncClient


async def _make_event(client: AsyncClient) -> None:
    team = (await client.post("/teams", json={"slug": "conclusion", "name": "Conclusion"})).json()
    await client.post("/events", json={"team_id": team["id"], "year": 2026})


async def test_pairing_token_round_trip(client: AsyncClient) -> None:
    await _make_event(client)

    mint = await client.post(
        "/pairing-tokens",
        json={"team_slug": "conclusion", "year": 2026, "role": "driver"},
    )
    assert mint.status_code == 201, mint.text
    body = mint.json()
    assert body["role"] == "driver"
    assert body["url_path"].startswith("/tracker.html?pair=")
    assert isinstance(body["token"], str) and len(body["token"]) >= 16

    redeem = await client.post(
        "/devices/from-pairing",
        json={"token": body["token"], "name": "Joris"},
    )
    assert redeem.status_code == 201, redeem.text
    creds = redeem.json()
    assert creds["name"] == "Joris"
    assert creds["role"] == "driver"
    assert isinstance(creds["token"], str) and len(creds["token"]) >= 30

    # Second attempt is rejected — single-use.
    again = await client.post(
        "/devices/from-pairing",
        json={"token": body["token"], "name": "Joris"},
    )
    assert again.status_code == 409


async def test_pairing_unknown_token_404(client: AsyncClient) -> None:
    resp = await client.post(
        "/devices/from-pairing",
        json={"token": "nope-nope-nope", "name": "Eva"},
    )
    assert resp.status_code == 404


async def test_pairing_expired_token_410(client: AsyncClient) -> None:
    # Mint then force-expire by updating the DB directly.
    await _make_event(client)
    mint = (
        await client.post(
            "/pairing-tokens",
            json={"team_slug": "conclusion", "year": 2026, "role": "runner"},
        )
    ).json()

    from sqlalchemy import text

    from app.db import engine

    async with engine.begin() as conn:
        await conn.execute(
            text("UPDATE pairing_token SET expires_at = :t WHERE token = :tok"),
            {"t": datetime.now(UTC) - timedelta(minutes=1), "tok": mint["token"]},
        )

    resp = await client.post(
        "/devices/from-pairing",
        json={"token": mint["token"], "name": "Eva"},
    )
    assert resp.status_code == 410


async def test_pairing_mint_unknown_team_404(client: AsyncClient) -> None:
    resp = await client.post(
        "/pairing-tokens",
        json={"team_slug": "ghost", "year": 2030, "role": "driver"},
    )
    assert resp.status_code == 404
