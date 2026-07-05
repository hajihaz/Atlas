"""Typed application settings, sourced from the environment (see .env.example).

Secrets are never hard-coded (ADR 0009): vendor keys and DB URLs come from the environment
or a secret manager. There are no broker credentials — Atlas has no execution capability
in Phase 2.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEV_DEFAULT_DB = "postgresql+psycopg://atlas:atlas@localhost:5432/atlas"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="ATLAS_", env_file=".env", extra="ignore", case_sensitive=False
    )

    env: str = "development"
    log_level: str = "INFO"
    timezone: str = "Asia/Kolkata"

    db_url: str = _DEV_DEFAULT_DB           # dev only; rejected in production (see validator)
    db_readonly_url: str | None = None      # least-privilege research reader (ADR 0009)

    storage_backend: str = "local"     # local | s3
    storage_root: str = "./data/local"

    # Optional test DB for @integration tests; when unset, those tests skip.
    test_db: str | None = Field(default=None, alias="ATLAS_TEST_DB")

    @model_validator(mode="after")
    def _forbid_dev_default_in_production(self) -> "Settings":
        # Never let the well-known dev credential reach a production deployment (ADR 0009).
        if self.env == "production" and self.db_url == _DEV_DEFAULT_DB:
            raise ValueError(
                "ATLAS_DB_URL is the dev default in a production environment — "
                "provide a real, secret-managed connection string"
            )
        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
