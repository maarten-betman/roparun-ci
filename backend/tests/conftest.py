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

    # app.db builds its engine at import time, which happens during pytest
    # *collection* (test modules import app.* → app.models → app.db) — long
    # before this fixture knows the testcontainer's mapped port. So the
    # module engine points at the default localhost:5432. Rebind it (and
    # the sessionmaker) to the container now. get_session() looks up
    # SessionLocal on the module at call time, so DI-based endpoints pick
    # this up.
    from sqlalchemy.ext.asyncio import (
        AsyncSession,
        async_sessionmaker,
        create_async_engine,
    )

    import app.db as appdb

    appdb.engine = create_async_engine(postgis_url, echo=False, pool_pre_ping=True)
    appdb.SessionLocal = async_sessionmaker(
        appdb.engine, expire_on_commit=False, class_=AsyncSession
    )

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

    import app.db as appdb

    async with appdb.engine.begin() as conn:
        await conn.execute(
            text(
                "TRUNCATE race_photo, race_point, pairing_token, change_event, position, "
                "device, waypoint, stage, route, event, team RESTART IDENTITY CASCADE"
            )
        )
