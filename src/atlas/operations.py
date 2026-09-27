"""Durable local operational state with atomic, fail-closed persistence."""

from __future__ import annotations

import json
import os
import secrets
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass(frozen=True)
class DurableState:
    version: int
    session_id: str
    status: str
    checkpoint: tuple[int, str]


class StateStore:
    def __init__(self, path: Path):
        self.path = path

    def save(self, state: DurableState) -> None:
        if state.version < 1 or not state.session_id or not state.status:
            raise ValueError("invalid durable state")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = json.dumps(asdict(state), sort_keys=True, separators=(",", ":"))
        tmp = self.path.with_name("." + self.path.name + ".tmp-" + secrets.token_hex(8))
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                handle.write(payload)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(tmp, self.path)
            os.chmod(self.path, 0o600)
            dir_fd = os.open(self.path.parent, os.O_RDONLY)
            try:
                os.fsync(dir_fd)
            finally:
                os.close(dir_fd)
        finally:
            if tmp.exists():
                tmp.unlink()

    def load(self) -> DurableState | None:
        if not self.path.exists():
            return None
        try:
            if self.path.stat().st_mode & 0o077:
                raise RuntimeError("durable state permissions are too broad")
            data = json.loads(self.path.read_text(encoding="utf-8"))
            checkpoint = tuple(data["checkpoint"])
            if len(checkpoint) != 2:
                raise ValueError("invalid checkpoint")
            return DurableState(
                int(data["version"]),
                str(data["session_id"]),
                str(data["status"]),
                (int(checkpoint[0]), str(checkpoint[1])),
            )
        except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError) as exc:
            raise RuntimeError("durable state is unreadable; refusing recovery") from exc


@dataclass(frozen=True)
class SandboxSession:
    session_id: str
    active: bool
    environment: str = "upstox-sandbox"

    @staticmethod
    def start() -> SandboxSession:
        return SandboxSession(secrets.token_hex(16), True)

    def stop(self) -> SandboxSession:
        return SandboxSession(self.session_id, False, self.environment)
