"""Configuration (12-factor, from environment). Adapter layer — depends on pydantic."""

from __future__ import annotations

from atlas.config.settings import Settings, get_settings

__all__ = ["Settings", "get_settings"]
