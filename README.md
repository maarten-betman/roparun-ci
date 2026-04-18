# roparun-ci

Web app for the Conclusion Intelligence Roparun team to plan, view, and live-track the ~520 km non-stop Paris→Rotterdam relay run.

## Quick start

Requires Docker + GNU Make.

```bash
cp .env.example .env    # optional: set VITE_MAPTILER_KEY for prettier tiles
make dev                # build + start api, web, db
make migrate            # enable PostGIS on first boot
```

- Viewer: http://localhost:5173
- Tracker PWA: http://localhost:5173/tracker.html
- API health: http://localhost:8000/healthz
- API + PostGIS: http://localhost:8000/readyz

See [`CLAUDE.md`](CLAUDE.md) for the architecture overview and day-to-day commands. The phased build plan lives in `/root/.claude/plans/i-want-to-create-magical-book.md`.

## Deploy (Coolify)

`docker-compose.prod.yml` is a minimal single-domain production stack: nginx
serves the built SPA and proxies `/api` and `/ws` to the FastAPI container on
the internal network. The api runs `alembic upgrade head` on startup.

1. Create a new Coolify resource from this repo, pick
   `docker-compose.prod.yml` as the compose file.
2. Set these env vars in Coolify (see `.env.prod.example`):
   - `POSTGRES_PASSWORD` — required, any strong string.
   - `ROPARUN_CORS_ORIGINS` — JSON list, e.g. `["https://your.domain"]`.
   - `VITE_MAPTILER_KEY` — optional; the map falls back to MapLibre demotiles.
3. Point Coolify's proxy at the `web` service (port 80).
4. After the first deploy, seed a demo route:
   `docker compose -f docker-compose.prod.yml exec api python -m app.scripts.seed`
   Then visit `/t/conclusion/2026`.

## Layout

```
backend/    FastAPI + PostGIS + Alembic (Python 3.12, SQLAlchemy 2.x async)
frontend/   Vite + React + TS + MapLibre; two entries (viewer, tracker PWA)
```

## License

MIT — see [`LICENSE`](LICENSE).
