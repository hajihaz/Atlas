"""Append-only stores for the trial ledger.

The in-memory store is for tests and reference semantics; the JSONL store is a simple,
durable, append-only file (one JSON object per line) suitable for a dev/local ledger. The
production ledger lives in Postgres (append-only table) behind the same protocol.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Protocol

try:  # POSIX advisory locking; absent on some platforms (then appends are unsynchronized).
    import fcntl
except ImportError:  # pragma: no cover
    fcntl = None  # type: ignore[assignment]


class LedgerStore(Protocol):
    """Append-only sequence of ledger entries."""

    def append(self, entry: dict[str, Any]) -> None: ...

    def read_all(self) -> list[dict[str, Any]]: ...


class InMemoryLedgerStore:
    def __init__(self) -> None:
        self._entries: list[dict[str, Any]] = []

    def append(self, entry: dict[str, Any]) -> None:
        self._entries.append(entry)

    def read_all(self) -> list[dict[str, Any]]:
        return list(self._entries)


class JsonlLedgerStore:
    """One JSON object per line, append-only. A **dev/local** store: append-only is a
    contract, not a hardware guarantee (the file is rewritable) — production uses the
    Postgres append-only table with DB-level triggers, and both anchor a head checkpoint to
    an external WORM store for truncation/re-chain detection (ADR 0012). Concurrent appends
    are serialized with an exclusive advisory lock where the platform supports it.
    """

    def __init__(self, path: str | Path) -> None:
        self._path = Path(path)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.touch(exist_ok=True)
        try:  # least-privilege file perms (0600) — no world read of the audit log
            self._path.chmod(0o600)
        except OSError:  # pragma: no cover
            pass

    def append(self, entry: dict[str, Any]) -> None:
        line = json.dumps(entry, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        with self._path.open("a", encoding="utf-8") as fh:
            if fcntl is not None:
                fcntl.flock(fh.fileno(), fcntl.LOCK_EX)  # serialize concurrent appends
            try:
                fh.write(line + "\n")
                fh.flush()
            finally:
                if fcntl is not None:
                    fcntl.flock(fh.fileno(), fcntl.LOCK_UN)

    def read_all(self) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        with self._path.open("r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line:
                    out.append(json.loads(line))
        return out
