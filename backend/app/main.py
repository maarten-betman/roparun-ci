from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import devices, events, health, ingest, live, public, routes, teams


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
    return app


app = create_app()
