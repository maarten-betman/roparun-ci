from __future__ import annotations

from httpx import AsyncClient

PARIS = [2.3522, 48.8566]
BRUSSELS = [4.3517, 50.8503]
ANTWERP = [4.4024, 51.2194]
ROTTERDAM = [4.4777, 51.9244]


async def _make_route(client: AsyncClient) -> str:
    team = (await client.post("/teams", json={"slug": "conclusion", "name": "Conclusion"})).json()
    event = (await client.post("/events", json={"team_id": team["id"], "year": 2026})).json()
    route = (
        await client.post("/routes", json={"event_id": event["id"], "name": "Paris → Rotterdam"})
    ).json()
    return str(route["id"])


async def test_create_and_get_route(client: AsyncClient) -> None:
    route_id = await _make_route(client)
    payload = {
        "stages": [
            {"ordinal": 0, "geom": {"type": "LineString", "coordinates": [PARIS, BRUSSELS]}},
            {"ordinal": 1, "geom": {"type": "LineString", "coordinates": [BRUSSELS, ANTWERP]}},
            {"ordinal": 2, "geom": {"type": "LineString", "coordinates": [ANTWERP, ROTTERDAM]}},
        ],
        "waypoints": [
            {
                "kind": "handover",
                "name": "Brussels",
                "geom": {"type": "Point", "coordinates": BRUSSELS},
            },
        ],
    }
    resp = await client.put(f"/routes/{route_id}/content", json=payload)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body["stages"]) == 3
    assert len(body["waypoints"]) == 1
    assert body["total_distance_m"] > 400_000  # Paris→Rotterdam is ~500km
    assert all(s["distance_m"] > 0 for s in body["stages"])

    # Reload — geometry round-trips
    reloaded = (await client.get(f"/routes/{route_id}")).json()
    assert reloaded["stages"][0]["geom"]["coordinates"][0] == PARIS


async def test_duplicate_team_slug_conflicts(client: AsyncClient) -> None:
    assert (await client.post("/teams", json={"slug": "t1", "name": "T1"})).status_code == 201
    dup = await client.post("/teams", json={"slug": "t1", "name": "Other"})
    assert dup.status_code == 409


async def test_gpx_round_trip(client: AsyncClient) -> None:
    route_id = await _make_route(client)
    gpx = """<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="50.8503" lon="4.3517"><name>Brussels</name></wpt>
  <trk><name>leg1</name><trkseg>
    <trkpt lat="48.8566" lon="2.3522"/>
    <trkpt lat="50.8503" lon="4.3517"/>
  </trkseg></trk>
  <trk><name>leg2</name><trkseg>
    <trkpt lat="50.8503" lon="4.3517"/>
    <trkpt lat="51.9244" lon="4.4777"/>
  </trkseg></trk>
</gpx>"""
    up = await client.post(
        f"/routes/{route_id}/gpx",
        files={"file": ("r.gpx", gpx, "application/gpx+xml")},
    )
    assert up.status_code == 200, up.text
    body = up.json()
    assert len(body["stages"]) == 2
    assert len(body["waypoints"]) == 1

    download = await client.get(f"/routes/{route_id}/gpx")
    assert download.status_code == 200
    assert download.headers["content-type"].startswith("application/gpx+xml")
    text = download.text
    assert "<trk>" in text
    assert "<trkseg>" in text


async def test_public_only_exposes_published(client: AsyncClient) -> None:
    route_id = await _make_route(client)
    await client.put(
        f"/routes/{route_id}/content",
        json={
            "stages": [
                {"ordinal": 0, "geom": {"type": "LineString", "coordinates": [PARIS, ROTTERDAM]}}
            ]
        },
    )
    # draft — public 404
    assert (await client.get("/public/conclusion/2026")).status_code == 404
