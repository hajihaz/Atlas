"""Production secret-provider boundary; no secret manager is selected or contacted here."""

from __future__ import annotations

from typing import Protocol


class SecretProvider(Protocol):
    def get_secret(self, name: str) -> str: ...


def require_runtime_secret(provider: SecretProvider, name: str) -> str:
    if not name or any(token in name.lower() for token in ("token=", "secret=", "password=")):
        raise ValueError("secret name must be an identifier, never secret material")
    value = provider.get_secret(name)
    if not value:
        raise RuntimeError(f"required runtime secret unavailable: {name}")
    return value
