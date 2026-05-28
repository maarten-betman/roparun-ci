from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="ROPARUN_", extra="ignore")

    database_url: str = Field(
        default="postgresql+psycopg://roparun:roparun@localhost:5432/roparun",
    )
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])
    env: str = "dev"
    # Shared secret gating /admin/* endpoints. Unset → admin disabled
    # (endpoints respond 503). Set via ROPARUN_ADMIN_TOKEN env var.
    admin_token: str | None = None
    # Directory where uploaded race photos/videos are stored + served from.
    # Mount a persistent volume here in production (ROPARUN_MEDIA_DIR).
    media_dir: str = "data/media"
    # Max single media upload, MB. Videos are stored without transcoding,
    # so cap to keep the volume sane (ROPARUN_MAX_UPLOAD_MB).
    max_upload_mb: int = 200


@lru_cache
def get_settings() -> Settings:
    return Settings()
