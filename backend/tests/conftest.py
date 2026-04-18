from __future__ import annotations

import os
from collections.abc import AsyncIterator, Iterator

import pytest
from httpx import ASGITransport, AsyncClient


def _docker_available() -> bool:
    try:
        import docker  # type: ignore[import-untyped]

        docker.from_env().ping()
        return True
    except Exception:
        return False


@pytest.fixture(scope="session")
def postgis_url() -> Iterator[str]:
    if not _docker_available():
        pytest.skip("docker daemon unavailable; skipping PostGIS integration tests")
    from testcontainers.postgres import PostgresContainer

    container = PostgresContainer(
        image="postgis/postgis:16-3.4",
        username="roparun",
        password="roparun",
        dbname="roparun",
    )
    container.start()
    try:
        host = container.get_container_host_ip()
        port = container.get_exposed_port(5432)
        yield f"postgresql+psycopg://roparun:roparun@{host}:{port}/roparun"
    finally:
        container.stop()


@pytest.fixture(scope="session")
def _configure_env(postgis_url: str) -> Iterator[None]:
    os.environ["ROPARUN_DATABASE_URL"] = postgis_url
    from app.config import get_settings

    get_settings.cache_clear()

    from alembic.config import Config

    from alembic import command

    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", postgis_url)
    command.upgrade(cfg, "head")
    yield


@pytest.fixture()
async def client(_configure_env: None) -> AsyncIterator[AsyncClient]:
    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as async_client:
        yield async_client

    from sqlalchemy import text

    from app.db import engine

    async with engine.begin() as conn:
        await conn.execute(
            text("TRUNCATE waypoint, stage, route, event, team RESTART IDENTITY CASCADE")
        )
