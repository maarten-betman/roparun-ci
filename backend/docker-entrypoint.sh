#!/bin/sh
# Runs Alembic to HEAD, then execs the CMD (typically uvicorn).
# Used by docker-compose.prod.yml so a fresh Coolify deploy self-migrates.
set -eu

echo "[entrypoint] alembic upgrade head"
alembic upgrade head

echo "[entrypoint] exec: $*"
exec "$@"
