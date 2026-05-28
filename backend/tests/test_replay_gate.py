from __future__ import annotations

import os
from collections.abc import Iterator

import pytest
from httpx import AsyncClient

REPLAY_PASSWORD = "let-me-watch"


@pytest.fixture()
def _replay_env() -> Iterator[None]:
    prev = os.environ.get("ROPARUN_REPLAY_PASSWORD")
    os.environ["ROPARUN_REPLAY_PASSWORD"] = REPLAY_PASSWORD
    from app.config import get_settings

    get_settings.cache_clear()
    try:
        yield
    finally:
        if prev is None:
            del os.environ["ROPARUN_REPLAY_PASSWORD"]
        else:
            os.environ["ROPARUN_REPLAY_PASSWORD"] = prev
        get_settings.cache_clear()


async def test_replay_open_when_password_unset(client: AsyncClient) -> None:
    resp = await client.get("/public/replay-status")
    assert resp.status_code == 200
    assert resp.json() == {"required": False, "authed": True}


async def test_replay_status_requires_when_set(client: AsyncClient, _replay_env: None) -> None:
    resp = await client.get("/public/replay-status")
    assert resp.status_code == 200
    assert resp.json() == {"required": True, "authed": False}


async def test_protected_endpoint_401_without_cookie(
    client: AsyncClient, _replay_env: None
) -> None:
    # require_replay runs as a dependency before the handler, so this 401s
    # even though there's no event/photos seeded.
    resp = await client.get("/public/conclusion/2026/photos")
    assert resp.status_code == 401


async def test_login_wrong_password_401(client: AsyncClient, _replay_env: None) -> None:
    resp = await client.post("/public/replay-login", json={"password": "nope"})
    assert resp.status_code == 401


async def test_login_sets_cookie_and_unlocks(client: AsyncClient, _replay_env: None) -> None:
    login = await client.post("/public/replay-login", json={"password": REPLAY_PASSWORD})
    assert login.status_code == 200
    # httpx stores the Set-Cookie; subsequent calls carry it.
    status = await client.get("/public/replay-status")
    assert status.json() == {"required": True, "authed": True}
    # A protected endpoint now passes the guard (404 = past auth, no data).
    photos = await client.get("/public/conclusion/2026/photos")
    assert photos.status_code in (200, 404)
    assert photos.status_code != 401


async def test_media_401_without_auth(client: AsyncClient, _replay_env: None) -> None:
    resp = await client.get("/media/whatever.jpg")
    assert resp.status_code == 401


async def test_media_query_token_allows(client: AsyncClient, _replay_env: None) -> None:
    # Correct ?k= passes the guard; 404 because the file doesn't exist.
    resp = await client.get(f"/media/missing.jpg?k={REPLAY_PASSWORD}")
    assert resp.status_code == 404
