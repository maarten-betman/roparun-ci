# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project intent

Web app for the Conclusion Intelligence Roparun team to **plan**, **view**, and **live-track** the ~520 km non-stop Paris→Rotterdam relay run (Whitsun weekend, ~25 people per team: 8 runners, 4+ cyclists, plus drivers / medics / caterers). Full build plan in `/root/.claude/plans/i-want-to-create-magical-book.md` (Phase 0 scaffold done; Phases 1–3 still to land).

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
make test           # backend pytest + frontend vitest
make lint           # ruff + eslint
make typecheck      # mypy + tsc
```

Direct single-test invocations (faster than Make):

```bash
# backend — inside backend/ with the dev extras installed, or:
docker compose exec api pytest tests/test_health.py::test_healthz -q

# frontend
cd frontend && npm run test -- src/viewer/App.test.tsx
```

## Architecture big-picture

- The backend is a single FastAPI app (`backend/app/main.py` → `create_app()`), with routers under `backend/app/routers/` and a shared async SQLAlchemy session (`backend/app/db.py`). Settings come from `ROPARUN_*` env vars via `pydantic-settings` (`backend/app/config.py`).
- Geometries live in PostGIS as `GEOGRAPHY` (EPSG:4326). Do not introduce projections in application code — let PostGIS handle distance/buffer/intersects. Only reach for `pyproj` if you truly need non-trivial projection math.
- Alembic runs **async** (see `backend/alembic/env.py`) and reuses `app.db.Base.metadata` as autogenerate target. Every migration must be re-runnable via `make migrate`.
- The frontend is one pnpm/npm workspace with two Vite inputs (`vite.config.ts` → `rollupOptions.input`). Shared code lives under `src/map/`; feature code is siloed under `src/viewer/`, `src/planner/`, `src/tracker/`. The tracker entry is the PWA — keep its bundle small (no MapLibre unless strictly needed).
- Live positions flow: **tracker PWA** → batch `POST /ingest` (with IndexedDB offline queue) → `position` table → WebSocket fan-out on `/ws/live` → **viewer** renders markers + breadcrumb trails. Phase 3 will introduce these pieces; they don't exist yet.

## Working in this repo

- **Do not invent features beyond the current phase.** Check `/root/.claude/plans/i-want-to-create-magical-book.md` for what's in scope now. Phase 0 shipped (scaffold + health probes + placeholder map). Phase 1 is route CRUD + GPX I/O + planner UI.
- When adding DB models, always pair them with an Alembic migration in the same commit. Never mutate an old migration after it's merged.
- The viewer must still render with `VITE_MAPTILER_KEY` unset (demo tiles fallback). Don't regress that — it's how CI and first-time contributors see the map.
- Keep `/healthz` cheap (no DB). `/readyz` is the one that touches PostGIS.
- CORS origins are configured via `ROPARUN_CORS_ORIGINS` (JSON list). Default covers Vite's `:5173`.
