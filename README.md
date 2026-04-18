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

## Layout

```
backend/    FastAPI + PostGIS + Alembic (Python 3.12, SQLAlchemy 2.x async)
frontend/   Vite + React + TS + MapLibre; two entries (viewer, tracker PWA)
```

## License

MIT — see [`LICENSE`](LICENSE).
