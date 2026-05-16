from __future__ import annotations

import os
from collections.abc import AsyncIterator, Iterator
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient

ADMIN_TOKEN = "test-admin-secret"


@pytest.fixture()
def _admin_env() -> Iterator[None]:
    """Set ROPARUN_ADMIN_TOKEN for the duration of a test. Clears the
    pydantic-settings lru_cache so the new value takes effect."""
    prev = os.environ.get("ROPARUN_ADMIN_TOKEN")
    os.environ["ROPARUN_ADMIN_TOKEN"] = ADMIN_TOKEN
    from app.config import get_settings

    get_settings.cache_clear()
    try:
        yield
    finally:
        if prev is None:
            del os.environ["ROPARUN_ADMIN_TOKEN"]
        else:
            os.environ["ROPARUN_ADMIN_TOKEN"] = prev
        get_settings.cache_clear()


@pytest_asyncio.fixture()
async def admin_client(client: AsyncClient, _admin_env: None) -> AsyncIterator[AsyncClient]:
    """Httpx client with the admin header pre-attached."""
    client.headers["x-admin-token"] = ADMIN_TOKEN
    yield client


async def _seed_event(client: AsyncClient) -> tuple[str, str]:
    team = (await client.post("/teams", json={"slug": "conclusion", "name": "Conclusion"})).json()
    event = (await client.post("/events", json={"team_id": team["id"], "year": 2026})).json()
    return team["id"], event["id"]


# ---- Auth ------------------------------------------------------------------


async def test_admin_ping_503_when_token_unset(client: AsyncClient) -> None:
    # No _admin_env fixture; ROPARUN_ADMIN_TOKEN unset.
    resp = await client.get("/admin/ping")
    assert resp.status_code == 503


async def test_admin_ping_401_when_header_missing(client: AsyncClient, _admin_env: None) -> None:
    resp = await client.get("/admin/ping")
    assert resp.status_code == 401


async def test_admin_ping_401_when_header_wrong(client: AsyncClient, _admin_env: None) -> None:
    resp = await client.get("/admin/ping", headers={"x-admin-token": "wrong"})
    assert resp.status_code == 401


async def test_admin_ping_200_when_header_correct(admin_client: AsyncClient) -> None:
    resp = await admin_client.get("/admin/ping")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


# ---- Stats -----------------------------------------------------------------


async def test_admin_stats_returns_zero_counts_for_fresh_event(
    admin_client: AsyncClient,
) -> None:
    _, event_id = await _seed_event(admin_client)
    resp = await admin_client.get("/admin/stats", params={"event_id": event_id})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["routes"] == 0
    assert body["devices"] == 0
    assert body["positions"] == 0
    assert body["change_events"] == 0
    assert body["waypoints"] == 0


# ---- Route PATCH ----------------------------------------------------------


async def test_admin_patch_route_flips_status_and_affects_public(
    admin_client: AsyncClient,
) -> None:
    _, event_id = await _seed_event(admin_client)
    route = (await admin_client.post("/routes", json={"event_id": event_id, "name": "R1"})).json()
    # New routes default to draft → public endpoint 404s.
    pub = await admin_client.get("/public/conclusion/2026")
    assert pub.status_code == 404
    # Flip to published.
    patch = await admin_client.patch(f"/admin/routes/{route['id']}", json={"status": "published"})
    assert patch.status_code == 200, patch.text
    assert patch.json()["status"] == "published"
    pub2 = await admin_client.get("/public/conclusion/2026")
    assert pub2.status_code == 200
    # Flip back to draft → public 404 again.
    await admin_client.patch(f"/admin/routes/{route['id']}", json={"status": "draft"})
    pub3 = await admin_client.get("/public/conclusion/2026")
    assert pub3.status_code == 404


async def test_admin_patch_route_renames(admin_client: AsyncClient) -> None:
    _, event_id = await _seed_event(admin_client)
    route = (await admin_client.post("/routes", json={"event_id": event_id, "name": "R1"})).json()
    patch = await admin_client.patch(f"/admin/routes/{route['id']}", json={"name": "Renamed"})
    assert patch.status_code == 200, patch.text
    assert patch.json()["name"] == "Renamed"


# ---- Device admin: list / patch / rotate / delete --------------------------


async def _register_device(client: AsyncClient) -> dict:
    resp = await client.post(
        "/devices",
        json={"team_slug": "conclusion", "year": 2026, "name": "Eva", "role": "driver"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_admin_list_devices(admin_client: AsyncClient) -> None:
    _, event_id = await _seed_event(admin_client)
    await _register_device(admin_client)
    resp = await admin_client.get("/admin/devices", params={"event_id": event_id})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body) == 1
    assert body[0]["name"] == "Eva"
    assert body[0]["role"] == "driver"
    assert body[0]["position_count"] == 0
    assert body[0]["change_event_count"] == 0


async def test_admin_patch_device_renames(admin_client: AsyncClient) -> None:
    await _seed_event(admin_client)
    device = await _register_device(admin_client)
    resp = await admin_client.patch(
        f"/admin/devices/{device['id']}", json={"name": "Eva van der Pol"}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["name"] == "Eva van der Pol"


async def test_admin_rotate_device_token_invalidates_old(admin_client: AsyncClient) -> None:
    await _seed_event(admin_client)
    device = await _register_device(admin_client)
    old_token = device["token"]

    # Old token should accept /ingest before rotation.
    pre = await admin_client.post(
        "/ingest",
        json={
            "positions": [
                {
                    "ts": datetime.now(UTC).isoformat(),
                    "lng": 4.0,
                    "lat": 52.0,
                }
            ]
        },
        headers={"authorization": f"Bearer {old_token}"},
    )
    assert pre.status_code == 202, pre.text

    rotate = await admin_client.post(f"/admin/devices/{device['id']}/rotate-token")
    assert rotate.status_code == 200, rotate.text
    new_token = rotate.json()["token"]
    assert new_token != old_token

    # Old token should now be invalid.
    post_old = await admin_client.post(
        "/ingest",
        json={
            "positions": [
                {
                    "ts": datetime.now(UTC).isoformat(),
                    "lng": 4.0,
                    "lat": 52.0,
                }
            ]
        },
        headers={"authorization": f"Bearer {old_token}"},
    )
    assert post_old.status_code == 401

    # New token works.
    post_new = await admin_client.post(
        "/ingest",
        json={
            "positions": [
                {
                    "ts": datetime.now(UTC).isoformat(),
                    "lng": 4.0,
                    "lat": 52.0,
                }
            ]
        },
        headers={"authorization": f"Bearer {new_token}"},
    )
    assert post_new.status_code == 202


async def test_admin_delete_device_cascades_positions_and_change_events(
    admin_client: AsyncClient,
) -> None:
    _, event_id = await _seed_event(admin_client)
    device = await _register_device(admin_client)
    token = device["token"]
    # Push one position and one change event.
    await admin_client.post(
        "/ingest",
        json={"positions": [{"ts": datetime.now(UTC).isoformat(), "lng": 4.0, "lat": 52.0}]},
        headers={"authorization": f"Bearer {token}"},
    )
    await admin_client.post(
        "/change-events",
        json={"ts": datetime.now(UTC).isoformat(), "lng": 4.0, "lat": 52.0},
        headers={"authorization": f"Bearer {token}"},
    )
    # Confirm counts.
    stats_pre = await admin_client.get("/admin/stats", params={"event_id": event_id})
    assert stats_pre.json()["positions"] == 1
    assert stats_pre.json()["change_events"] == 1
    # Delete the device.
    delete = await admin_client.delete(f"/admin/devices/{device['id']}")
    assert delete.status_code == 204
    # Counts should be zero (cascade).
    stats_post = await admin_client.get("/admin/stats", params={"event_id": event_id})
    assert stats_post.json()["positions"] == 0
    assert stats_post.json()["change_events"] == 0


# ---- Position pagination ---------------------------------------------------


async def test_admin_positions_cursor_pagination(admin_client: AsyncClient) -> None:
    _, event_id = await _seed_event(admin_client)
    device = await _register_device(admin_client)
    # Push 25 positions, each 1s apart.
    base = datetime.now(UTC) - timedelta(seconds=30)
    batch = [
        {"ts": (base + timedelta(seconds=i)).isoformat(), "lng": 4.0, "lat": 52.0}
        for i in range(25)
    ]
    await admin_client.post(
        "/ingest",
        json={"positions": batch},
        headers={"authorization": f"Bearer {device['token']}"},
    )
    page1 = await admin_client.get("/admin/positions", params={"event_id": event_id, "limit": 10})
    assert page1.status_code == 200, page1.text
    p1 = page1.json()
    assert len(p1["items"]) == 10
    assert p1["next_cursor"] is not None
    seen = {it["id"] for it in p1["items"]}
    page2 = await admin_client.get(
        "/admin/positions",
        params={"event_id": event_id, "limit": 10, "cursor": p1["next_cursor"]},
    )
    p2 = page2.json()
    assert len(p2["items"]) == 10
    for it in p2["items"]:
        assert it["id"] not in seen  # no overlap.
    page3 = await admin_client.get(
        "/admin/positions",
        params={"event_id": event_id, "limit": 10, "cursor": p2["next_cursor"]},
    )
    p3 = page3.json()
    assert len(p3["items"]) == 5  # remaining 5 of 25.
    assert p3["next_cursor"] is None


# ---- Cleanup positions -----------------------------------------------------


async def test_admin_cleanup_positions_respects_event_and_threshold(
    admin_client: AsyncClient,
) -> None:
    _, event_id = await _seed_event(admin_client)
    device = await _register_device(admin_client)
    now = datetime.now(UTC)
    await admin_client.post(
        "/ingest",
        json={
            "positions": [
                {"ts": (now - timedelta(hours=10)).isoformat(), "lng": 4.0, "lat": 52.0},
                {"ts": (now - timedelta(hours=2)).isoformat(), "lng": 4.0, "lat": 52.0},
                {"ts": now.isoformat(), "lng": 4.0, "lat": 52.0},
            ]
        },
        headers={"authorization": f"Bearer {device['token']}"},
    )
    threshold = (now - timedelta(hours=5)).isoformat()
    resp = await admin_client.post(
        "/admin/cleanup/positions",
        json={"event_id": event_id, "older_than": threshold},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["deleted"] == 1
    # Confirm 2 remain.
    stats = await admin_client.get("/admin/stats", params={"event_id": event_id})
    assert stats.json()["positions"] == 2


# ---- Tracker flow untouched ------------------------------------------------


async def test_tracker_flow_unaffected_by_admin_auth(client: AsyncClient) -> None:
    """Sanity: every existing endpoint that doesn't carry the admin header
    still works as before."""
    team = (await client.post("/teams", json={"slug": "conclusion", "name": "Conclusion"})).json()
    await client.post("/events", json={"team_id": team["id"], "year": 2026})
    device = await client.post(
        "/devices",
        json={"team_slug": "conclusion", "year": 2026, "name": "Joris", "role": "runner"},
    )
    assert device.status_code == 201
    ingest = await client.post(
        "/ingest",
        json={"positions": [{"ts": datetime.now(UTC).isoformat(), "lng": 4.0, "lat": 52.0}]},
        headers={"authorization": f"Bearer {device.json()['token']}"},
    )
    assert ingest.status_code == 202
