"""Canonical serialization, content hashing, and hash-chaining.

These primitives underpin three Atlas guarantees:

* **Reproducibility** — a content hash identifies a dataset/snapshot exactly (ADR 0014).
* **Tamper-evidence** — hash-chaining makes the trial ledger and ingestion audit
  append-only *and detectably* immutable (ADR 0009 / F-B4).
* **Determinism** — canonical JSON is byte-stable across runs and machines, so equal
  content always hashes equal.

Pure standard library.
"""

from __future__ import annotations

import datetime as _dt
import hashlib
import json
from decimal import Decimal
from enum import Enum
from typing import Any

#: Sentinel opening hash for a fresh chain ("genesis").
GENESIS_HASH = "0" * 64


def _default(obj: Any) -> Any:
    """JSON encoder for the value types Atlas records contain.

    Decimals are emitted as strings (never floats — float rounding would break
    reproducibility). Datetimes are UTC ISO-8601. Enums use their value.
    """
    if isinstance(obj, Decimal):
        return f"D:{obj:f}"  # tagged so 1 (int) and Decimal('1') never collide
    if isinstance(obj, _dt.datetime):
        if obj.tzinfo is None:
            raise ValueError("refusing to hash a naive datetime (point-in-time hazard)")
        return obj.astimezone(_dt.timezone.utc).isoformat()
    if isinstance(obj, _dt.date):
        return obj.isoformat()
    if isinstance(obj, Enum):
        return obj.value
    if isinstance(obj, (set, frozenset)):
        return sorted(obj)
    if isinstance(obj, bytes):
        return obj.hex()
    raise TypeError(f"cannot canonicalize {type(obj).__name__}")


def canonical_json(obj: Any) -> str:
    """Deterministic JSON string: sorted keys, no whitespace, stable value encoding."""
    return json.dumps(
        obj,
        default=_default,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )


def content_hash(obj: Any) -> str:
    """SHA-256 hex digest of the canonical form of *obj*."""
    return hashlib.sha256(canonical_json(obj).encode("utf-8")).hexdigest()


def chain_hash(previous_hash: str, record_hash: str) -> str:
    """Fold a record's hash into a chain: H(previous || record).

    Any later mutation of an earlier record breaks every subsequent link, so the whole
    chain is verifiable from its head hash alone.
    """
    return hashlib.sha256(f"{previous_hash}:{record_hash}".encode("utf-8")).hexdigest()


def hash_bytes(data: bytes) -> str:
    """SHA-256 of raw bytes (e.g. a stored vendor payload or Parquet file)."""
    return hashlib.sha256(data).hexdigest()
