"""Replay a GPX track over /ingest as a fake device.

Useful for demoing the live viewer without wiring up real phones — register
a device, then stream fixes from a GPX file at a given speed factor.

Usage (inside the api container):

    # First: register the simulator as a device (one-shot, via the API)
    # Then run with the returned token.
    python -m app.scripts.simulate_tracker \
        --gpx data/gpx/2026/2026V3\ -\ Lopers\ track\ -\ Frankrijk\ -\ Roparun.gpx \
        --token <bearer> \
        --speed 120     # 120x real-time so a 30h race runs in ~15 minutes

The script posts batches of 20 fixes at a time; if the api is unreachable
it retries with an exponential backoff (a realistic tracker-in-the-woods
failure mode worth exercising).
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

import gpxpy
import httpx


async def _post_batch(
    client: httpx.AsyncClient, base: str, token: str, positions: list[dict[str, object]]
) -> None:
    backoff = 1.0
    for _ in range(5):
        try:
            r = await client.post(
                f"{base}/ingest",
                headers={"authorization": f"Bearer {token}"},
                json={"positions": positions},
            )
            if r.status_code == 202:
                return
            print(f"  ingest failed: {r.status_code} {r.text[:200]}", file=sys.stderr)
        except httpx.HTTPError as e:
            print(f"  ingest error: {e}", file=sys.stderr)
        await asyncio.sleep(backoff)
        backoff = min(backoff * 2, 30.0)


async def simulate(gpx_path: Path, token: str, base: str, speed: float) -> None:
    with gpx_path.open("r", encoding="utf-8-sig") as fp:
        gpx = gpxpy.parse(fp)
    coords: list[tuple[float, float]] = []
    for track in gpx.tracks:
        for seg in track.segments:
            coords.extend((p.longitude, p.latitude) for p in seg.points)
    if not coords:
        raise SystemExit("GPX had no trackpoints")

    print(f"Replaying {len(coords)} fixes at {speed}x real-time -> {base}/ingest")
    start = datetime.now(UTC)
    batch: list[dict[str, object]] = []
    async with httpx.AsyncClient(timeout=10.0) as client:
        for i, (lng, lat) in enumerate(coords):
            # One simulated second between fixes, scaled by `speed`.
            batch.append(
                {
                    "ts": (start + timedelta(seconds=i)).isoformat(),
                    "lng": lng,
                    "lat": lat,
                }
            )
            if len(batch) >= 20:
                await _post_batch(client, base, token, batch)
                batch = []
                await asyncio.sleep(max(0.05, 1.0 / speed * 20))  # 20 fixes of pacing
        if batch:
            await _post_batch(client, base, token, batch)
    print("done")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--gpx", type=Path, required=True)
    ap.add_argument("--token", required=True, help="bearer token from POST /devices")
    ap.add_argument("--base", default="http://localhost:8000")
    ap.add_argument("--speed", type=float, default=60.0)
    args = ap.parse_args()
    t0 = time.time()
    asyncio.run(simulate(args.gpx, args.token, args.base, args.speed))
    print(f"total: {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
