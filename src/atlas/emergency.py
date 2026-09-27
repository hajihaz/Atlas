"""Fail-closed emergency control with optional durable persistence."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path


@dataclass
class EmergencyControl:
    kill_switch: bool = False
    halted: bool = False
    state_path: Path | None = None

    @classmethod
    def recover(cls, path: Path) -> EmergencyControl:
        if not path.exists():
            return cls(False, False, path)
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            # Any persisted emergency state is interpreted conservatively.
            return cls(bool(raw["kill_switch"]), bool(raw["halted"]), path)
        except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError):
            return cls(True, True, path)

    def _persist(self) -> None:
        if self.state_path is None:
            return
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.state_path.with_suffix(self.state_path.suffix + ".tmp")
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as h:
            json.dump({"kill_switch": self.kill_switch, "halted": self.halted}, h, sort_keys=True)
            h.flush()
            os.fsync(h.fileno())
        os.replace(tmp, self.state_path)
        os.chmod(self.state_path, 0o600)

    def engage(self) -> None:
        self.kill_switch = True
        self.halted = True
        self._persist()

    def assert_clear(self) -> None:
        if self.kill_switch or self.halted:
            raise RuntimeError("emergency halt active")
