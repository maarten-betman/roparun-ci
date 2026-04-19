# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project intent

Web app for the Conclusion Intelligence Roparun team to **plan**, **view**, and **live-track** the ~520 km non-stop Paris→Rotterdam relay run (Whitsun weekend, ~25 people per team: 8 runners, 4+ cyclists, plus drivers / medics / caterers). Full build plan in `/root/.claude/plans/i-want-to-create-magical-book.md` (Phases 0 + 1 shipped; Phases 2–3 still to land).

Default branch is `master`. License is MIT.

## Stack at a glance

- **backend/** — FastAPI, SQLAlchemy 2.x async + GeoAlchemy2 over psycopg v3, Alembic, Pydantic v2. Tests with pytest + httpx + testcontainers. Lint/format/typecheck: ruff, mypy.
- **frontend/** — Vite + React 18 + TypeScript + MapLibre GL + TanStack Query. Two Vite entrypoints in one workspace: `index.html` (public viewer + planner) and `tracker.html` (installable PWA for crew phones). Tests with vitest.
- **db** — PostgreSQL 16 + PostGIS 3.4 (`postgis/postgis:16-3.4`); initial migration `backend/alembic/versions/0001_init_postgis.py` enables the extension.
- **Map tiles** — MapTiler free tier; set `VITE_MAPTILER_KEY` in `.env` (falls back to MapLibre `demotiles` when unset, so the map still renders without a key).

## Common commands

All targets go through Docker so you don't need Python/Node/Postgres locally.

```bash
make dev            # docker compose up --build; api on :8000, web on :5173
make down           # stop the stack
make logs           # tail all services
make migrate        # alembic upgrade head inside the api container
make revision m="add routes table"   # autogenerate a new migration
make seed           # populate a demo Conclusion 2026 route (published)
make load-roparun-2026  # load the official 2026 V3 GPX set (published)
make test           # backend pytest + frontend vitest
make lint           # ruff + eslint
make typecheck      # mypy + tsc
```

Direct single-test invocations (faster than Make):

```bash
# backend — inside backend/ with the dev extras installed, or:
docker compose exec api pytest tests/test_routes.py::test_gpx_round_trip -q

# frontend
cd frontend && npm run test -- src/map/style.test.ts
```

Backend integration tests (everything in `tests/test_routes.py`) require a
reachable Docker daemon: `conftest.py` spins a `postgis/postgis:16-3.4`
testcontainer, runs Alembic to HEAD against it, and shares it across the
session. When the daemon is unavailable the fixture calls `pytest.skip` so the
rest of the suite (e.g. `test_gpx_service.py` pure-unit tests) still runs.

## Architecture big-picture

- The backend is a single FastAPI app (`backend/app/main.py` → `create_app()`), with routers under `backend/app/routers/` and a shared async SQLAlchemy session (`backend/app/db.py`). Settings come from `ROPARUN_*` env vars via `pydantic-settings` (`backend/app/config.py`).
- Geometries live in PostGIS as `GEOGRAPHY` (EPSG:4326). Do not introduce projections in application code — let PostGIS handle distance/buffer/intersects. Only reach for `pyproj` if you truly need non-trivial projection math.
- Alembic runs **async** (see `backend/alembic/env.py`) and reuses `app.db.Base.metadata` as autogenerate target. Every migration must be re-runnable via `make migrate`.
- The frontend is one pnpm/npm workspace with two Vite inputs (`vite.config.ts` → `rollupOptions.input`). Shared code lives under `src/map/` (style resolver) and `src/api/` (typed client + DTOs); feature code is siloed under `src/viewer/`, `src/planner/`, `src/tracker/`. The tracker entry is the PWA — keep its bundle small (no MapLibre unless strictly needed). `src/viewer/main.tsx` is the single entry for `index.html` and dispatches by pathname: `/planner*` renders the planner, `/t/:slug/:year` renders the public viewer for that team+year, everything else renders the default viewer.
- Route data model (see `backend/app/models/`): `team` → `event` → `route` → ordered `stage[]` + `waypoint[]`. A `route` has `status ∈ {draft, published}`; the `/public/{slug}/{year}` endpoint only returns **published** routes. Stage/waypoint geometries are PostGIS `GEOGRAPHY(LINESTRING|POINT, 4326)`; stage distances are computed server-side via `ST_Length(geom)` in `services/routes.load_route_detail`, so clients never have to project.
- A single route can carry many overlays. `stage.layer` (e.g. `"runners"`, `"vehicle_b"`) groups stages into render layers; `waypoint.category` (e.g. `"checkpoints"`, `"km_markers"`, `"water_stops_heat_protocol"`) narrows the broad `waypoint.kind` enum. The viewer colors stages by layer and waypoints by kind. Sources in `backend/data/gpx/2026/`; loader is `app.scripts.load_roparun_2026` (wired to `make load-roparun-2026`). 24k+ POIs are expected, so the viewer scales `circle-radius` by zoom to stay readable at small zoom levels.
- Viewer rendering: `frontend/src/viewer/catalog.ts` is the single source of truth for layer/category display names, colors, and default-visible flag. `Viewer.tsx` builds GeoJSON FCs once and uses MapLibre `setFilter` to toggle visibility (no re-render on toggle). Heavy point clouds (vehicle_*_allowed/forbidden, runner_route_points, km_markers) default to **off**; checkpoints/handovers/water-stops/hazards/sleeping/toilets/passages default to **on**. Sidebar UI lives in `Sidebar.tsx` + `sidebar.css`; on screens <=720 px wide it collapses to a bottom drawer toggled by the `Layers` button.
- GeoJSON in/out: the API accepts and returns RFC 7946 `LineString` / `Point` objects directly (see `schemas/geojson.py`). Conversions to/from PostGIS go through `services/geo.py` using `shapely` + `WKTElement`. Don't introduce alternative formats (WKB strings, EWKT, lat/lng tuples) at the API boundary.
- GPX: `services/gpx.parse_gpx` maps each `<trkseg>` to one stage and each `<wpt>` to a waypoint (`kind=poi`); `build_gpx` is the inverse. `PUT /routes/{id}/content` and `POST /routes/{id}/gpx` both fully replace the stage + waypoint lists — there is no partial-update endpoint by design, the planner batches edits and pushes the whole thing.
- Live positions flow: **tracker PWA** → batch `POST /ingest` (with IndexedDB offline queue) → `position` table → WebSocket fan-out on `/ws/live` → **viewer** renders markers + breadcrumb trails. Phase 3 will introduce these pieces; they don't exist yet.

## Working in this repo

- **Do not invent features beyond the current phase.** Check `/root/.claude/plans/i-want-to-create-magical-book.md` for what's in scope now. Phase 0 shipped (scaffold + health probes + placeholder map). Phase 1 shipped (routes CRUD, GPX I/O, planner UI, public viewer endpoint, seed script). Phase 2 shipped (sidebar with layer/category toggles, mobile bottom-sheet, hover popups, default-hidden noisy POI clouds). Phase 3 is live tracking. Elevation profile is intentionally deferred — source GPX has no `<ele>` data, so it would need an external elevation source.
- When adding DB models, always pair them with an Alembic migration in the same commit. Never mutate an old migration after it's merged.
- The viewer must still render with `VITE_MAPTILER_KEY` unset (demo tiles fallback). Don't regress that — it's how CI and first-time contributors see the map.
- Keep `/healthz` cheap (no DB). `/readyz` is the one that touches PostGIS.
- CORS origins are configured via `ROPARUN_CORS_ORIGINS` (JSON list). Default covers Vite's `:5173`.
