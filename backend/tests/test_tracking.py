from __future__ import annotations

from datetime import UTC, datetime

from httpx import AsyncClient


async def _make_event(client: AsyncClient) -> None:
    team = (await client.post("/teams", json={"slug": "conclusion", "name": "Conclusion"})).json()
    await client.post("/events", json={"team_id": team["id"], "year": 2026})


async def test_register_device_returns_bearer_token(client: AsyncClient) -> None:
    await _make_event(client)
    resp = await client.post(
        "/devices",
        json={"team_slug": "conclusion", "year": 2026, "name": "Eva", "role": "runner"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["name"] == "Eva"
    assert body["role"] == "runner"
    assert isinstance(body["token"], str) and len(body["token"]) >= 30


async def test_register_device_rejects_unknown_event(client: AsyncClient) -> None:
    resp = await client.post(
        "/devices",
        json={"team_slug": "ghost", "year": 2030, "name": "Noone"},
    )
    assert resp.status_code == 404


async def test_ingest_persists_positions_and_bumps_last_seen(client: AsyncClient) -> None:
    await _make_event(client)
    creds = (
        await client.post(
            "/devices",
            json={"team_slug": "conclusion", "year": 2026, "name": "Eva", "role": "runner"},
        )
    ).json()
    headers = {"Authorization": f"Bearer {creds['token']}"}

    ts1 = datetime(2026, 5, 23, 14, 0, 0, tzinfo=UTC).isoformat()
    ts2 = datetime(2026, 5, 23, 14, 0, 5, tzinfo=UTC).isoformat()
    body = {
        "positions": [
            {"ts": ts1, "lng": 2.3522, "lat": 48.8566},
            {"ts": ts2, "lng": 2.3525, "lat": 48.8570, "accuracy_m": 8.1},
        ]
    }
    resp = await client.post("/ingest", json=body, headers=headers)
    assert resp.status_code == 202, resp.text
    assert resp.json() == {"accepted": 2}

    # /public/.../live exposes the latest snapshot + breadcrumb trail.
    snap = await client.get("/public/conclusion/2026/live")
    assert snap.status_code == 200
    devices = snap.json()["devices"]
    assert len(devices) == 1
    assert devices[0]["name"] == "Eva"
    # Breadcrumb is newest-first; last point is the second fix.
    last = devices[0]["last"]
    assert round(last["lng"], 4) == 2.3525
    assert round(last["lat"], 4) == 48.8570
    assert len(devices[0]["breadcrumb"]) == 2


async def test_ingest_rejects_missing_bearer(client: AsyncClient) -> None:
    ts = datetime(2026, 5, 23, 14, 0, 0, tzinfo=UTC).isoformat()
    resp = await client.post(
        "/ingest",
        json={"positions": [{"ts": ts, "lng": 0.0, "lat": 0.0}]},
    )
    assert resp.status_code == 401


async def test_live_404_for_unknown_team(client: AsyncClient) -> None:
    resp = await client.get("/public/ghost/2030/live")
    assert resp.status_code == 404
