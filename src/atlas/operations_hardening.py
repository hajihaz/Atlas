"""Durable operational primitives for crash-safe paper execution.

No network or live-broker authority belongs in this module.
"""

from __future__ import annotations

import json
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import cast

from atlas.common.hashing import content_hash


def _atomic_private_json(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, raw_tmp = tempfile.mkstemp(prefix=path.name + ".", dir=path.parent)
    tmp = Path(raw_tmp)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, sort_keys=True, separators=(",", ":"))
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
        os.chmod(path, 0o600)
        dir_fd = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
    finally:
        if tmp.exists():
            tmp.unlink()


def _read_private_json(path: Path) -> dict[str, object]:
    if path.stat().st_mode & 0o077:
        raise RuntimeError("operational state permissions are too broad")
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as exc:
        raise RuntimeError("operational state is unreadable; refusing recovery") from exc
    if not isinstance(raw, dict):
        raise RuntimeError("operational state root must be an object")
    return raw


class AppliedEventStore:
    """Durable exactly-once registry for externally observed event IDs."""

    VERSION = 1

    def __init__(self, path: str | Path):
        self.path = Path(path)

    def load(self) -> frozenset[str]:
        if not self.path.exists():
            return frozenset()
        raw = _read_private_json(self.path)
        if raw.get("version") != self.VERSION or not isinstance(raw.get("event_ids"), list):
            raise RuntimeError("invalid applied-event registry")
        ids = cast(list[object], raw["event_ids"])
        if any(not isinstance(item, str) or not item for item in ids):
            raise RuntimeError("invalid applied-event id")
        if len(ids) != len(set(ids)):
            raise RuntimeError("duplicate applied-event id in registry")
        return frozenset(cast(list[str], ids))

    def save(self, event_ids: set[str] | frozenset[str]) -> None:
        if any(not item for item in event_ids):
            raise ValueError("event IDs must be non-empty")
        _atomic_private_json(self.path, {"version": self.VERSION, "event_ids": sorted(event_ids)})


@dataclass(frozen=True)
class EmergencyState:
    engaged: bool
    reason: str
    generation: int

    @property
    def state_hash(self) -> str:
        return content_hash(
            {"engaged": self.engaged, "reason": self.reason, "generation": self.generation}
        )


class DurableEmergencyStore:
    """Persistent fail-closed emergency state."""

    VERSION = 1

    def __init__(self, path: str | Path):
        self.path = Path(path)

    def load(self) -> EmergencyState:
        if not self.path.exists():
            return EmergencyState(False, "", 0)
        raw = _read_private_json(self.path)
        if raw.get("version") != self.VERSION:
            raise RuntimeError("unsupported emergency-state version")
        try:
            generation = raw["generation"]
            if not isinstance(generation, int):
                raise TypeError("generation must be int")
            state = EmergencyState(bool(raw["engaged"]), str(raw["reason"]), generation)
        except (KeyError, TypeError, ValueError) as exc:
            raise RuntimeError("invalid emergency state") from exc
        if state.generation < 0 or (state.engaged and not state.reason):
            raise RuntimeError("invalid emergency state")
        expected = content_hash(
            {
                "engaged": state.engaged,
                "reason": state.reason,
                "generation": state.generation,
            }
        )
        if raw.get("state_hash") != expected:
            raise RuntimeError("emergency-state integrity failure")
        return state

    def engage(self, reason: str) -> EmergencyState:
        if not reason.strip():
            raise ValueError("emergency reason is required")
        previous = self.load()
        state = EmergencyState(True, reason.strip(), previous.generation + 1)
        self._save(state)
        return state

    def clear(self, reason: str) -> EmergencyState:
        if not reason.strip():
            raise ValueError("clear reason is required")
        previous = self.load()
        state = EmergencyState(False, reason.strip(), previous.generation + 1)
        self._save(state)
        return state

    def assert_clear(self) -> None:
        state = self.load()
        if state.engaged:
            raise RuntimeError(f"persistent emergency halt active: {state.reason}")

    def _save(self, state: EmergencyState) -> None:
        _atomic_private_json(
            self.path,
            {
                "version": self.VERSION,
                "engaged": state.engaged,
                "reason": state.reason,
                "generation": state.generation,
                "state_hash": state.state_hash,
            },
        )
