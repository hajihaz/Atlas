"""Deterministic, content-addressed identifiers.

Atlas avoids random UUIDs in the domain core: identity is derived from content, so the
same logical thing always gets the same id on any machine, in any run. This is what makes
snapshots and trials reproducible and de-duplicable (ADR 0014).
"""

from __future__ import annotations

from typing import Any

from atlas.common.hashing import content_hash


def deterministic_id(prefix: str, *parts: Any) -> str:
    """A short, stable id: ``<prefix>_<first 16 hex of sha256(parts)>``.

    Equal *parts* always yield the same id; different parts effectively never collide.
    """
    digest = content_hash(list(parts))
    return f"{prefix}_{digest[:16]}"


def instrument_id(isin: str | None, exchange: str, symbol: str) -> str:
    """Stable instrument id.

    Prefers ISIN (stable across NSE symbol changes); falls back to (exchange, symbol)
    only when ISIN is genuinely unavailable (e.g. some indices). Symbol *history* is
    tracked separately so a symbol change never mints a new instrument.
    """
    if isin:
        return deterministic_id("inst", "isin", isin.upper())
    return deterministic_id("inst", "sym", exchange.upper(), symbol.upper())


def snapshot_id(
    as_of_iso: str,
    universe_spec: Any,
    content_digest: str,
    code_version: str | None = None,
    dependency_lock_hash: str | None = None,
) -> str:
    """Snapshot id: identity == (as-of, universe, content, **code version, deps lock**).

    Code and deps are part of identity because the adjusted series is *derived in code*
    (adjust-on-read): the same raw content under different code/deps is a different result,
    so "same snapshot_id" must imply "same code that produced it" (ADR 0014 / reproducibility).
    """
    return deterministic_id(
        "snap", as_of_iso, universe_spec, content_digest, code_version, dependency_lock_hash
    )


def ingestion_run_id(source: str, as_of_iso: str, scope: Any) -> str:
    """Deterministic id for one ingestion run (source x knowledge-time x scope)."""
    return deterministic_id("run", source, as_of_iso, scope)
