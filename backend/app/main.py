from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .routers import (
    admin,
    change_events,
    devices,
    events,
    health,
    ingest,
    live,
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

    # Serve uploaded race photos. Created if missing so StaticFiles can
    # mount on a fresh deploy before the first upload. In production this
    # path is a persistent volume (ROPARUN_MEDIA_DIR).
    media_dir = Path(settings.media_dir)
    media_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/media", StaticFiles(directory=media_dir), name="media")
    return app


app = create_app()
