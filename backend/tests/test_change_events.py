from __future__ import annotations

from datetime import UTC, datetime

from httpx import AsyncClient


async def _pair_driver(client: AsyncClient) -> str:
    """Create team+event, register a driver device, return its bearer token."""
    team = (await client.post("/teams", json={"slug": "conclusion", "name": "Conclusion"})).json()
    await client.post("/events", json={"team_id": team["id"], "year": 2026})
    creds = (
        await client.post(
            "/devices",
            json={"team_slug": "conclusion", "year": 2026, "name": "Joris", "role": "driver"},
        )
    ).json()
    return creds["token"]


async def test_post_change_event_persists_and_shows_in_public_list(client: AsyncClient) -> None:
    token = await _pair_driver(client)
    ts = datetime(2026, 5, 23, 15, 0, 0, tzinfo=UTC).isoformat()
    resp = await client.post(
        "/change-events",
        json={"ts": ts, "lng": 3.1234, "lat": 49.9876},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["device_name"] == "Joris"
    assert body["lng"] == 3.1234
    assert body["lat"] == 49.9876

    listing = await client.get("/public/conclusion/2026/change-events")
    assert listing.status_code == 200
    events = listing.json()
    assert len(events) == 1
    assert events[0]["id"] == body["id"]


async def test_change_event_rejects_missing_bearer(client: AsyncClient) -> None:
    ts = datetime(2026, 5, 23, 15, 0, 0, tzinfo=UTC).isoformat()
    resp = await client.post(
        "/change-events",
        json={"ts": ts, "lng": 0, "lat": 0},
    )
    assert resp.status_code == 401


async def test_change_event_public_listing_is_newest_first(client: AsyncClient) -> None:
    token = await _pair_driver(client)
    hdrs = {"Authorization": f"Bearer {token}"}
    for i, (lng, lat) in enumerate([(2.0, 49.0), (2.5, 49.5), (3.0, 50.0)]):
        ts = datetime(2026, 5, 23, 15, i, 0, tzinfo=UTC).isoformat()
        await client.post("/change-events", json={"ts": ts, "lng": lng, "lat": lat}, headers=hdrs)
    events = (await client.get("/public/conclusion/2026/change-events")).json()
    assert [round(e["lng"], 2) for e in events] == [3.0, 2.5, 2.0]


async def test_change_event_list_404_for_unknown_team(client: AsyncClient) -> None:
    resp = await client.get("/public/ghost/2030/change-events")
    assert resp.status_code == 404
