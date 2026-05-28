from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import (
    admin,
    change_events,
    devices,
    events,
    health,
    ingest,
    live,
    media,
    public,
    routes,
    teams,
)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Roparun CI", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router)
    app.include_router(teams.router)
    app.include_router(events.router)
    app.include_router(routes.router)
    app.include_router(public.router)
    app.include_router(devices.router)
    app.include_router(ingest.router)
    app.include_router(live.router)
    app.include_router(change_events.router)
    app.include_router(admin.router)
    app.include_router(media.router)

    # Ensure the media dir exists on a fresh deploy (before first upload).
    # In production this path is a persistent volume (ROPARUN_MEDIA_DIR).
    # Files are served by the gated media router above, not StaticFiles, so
    # the replay password (when set) covers them too.
    Path(settings.media_dir).mkdir(parents=True, exist_ok=True)
    return app


app = create_app()
