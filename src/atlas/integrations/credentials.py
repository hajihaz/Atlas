"""Explicit owner-local Analytics credential loading; never implicit account activation."""

from __future__ import annotations

import os
import re
import stat
from pathlib import Path

_MAX_FILE_BYTES = 32_768
_JWT = re.compile(r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")


def read_analytics_credential(path: Path) -> str:
    """Read one Analytics credential from an explicitly supplied private POSIX file.

    File naming/JWT shape do not prove provider permissions. HTTP authority stays
    confined to Atlas's pinned read-only transport, regardless of token contents.
    """
    path = Path(path).expanduser()
    if path.is_symlink() or path.parent.is_symlink():
        raise ValueError("Analytics credential file and parent must not be symlinks")
    parent = path.parent.stat()
    if parent.st_uid != os.getuid() or stat.S_IMODE(parent.st_mode) & 0o077:
        raise ValueError("Analytics credential directory must be private and owner-owned")
    metadata = path.lstat()
    if not stat.S_ISREG(metadata.st_mode):
        raise ValueError("Analytics credential must be a regular file")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, "r", encoding="ascii") as stream:
        opened = os.fstat(stream.fileno())
        if (
            not stat.S_ISREG(opened.st_mode)
            or opened.st_uid != os.getuid()
            or stat.S_IMODE(opened.st_mode) & 0o077
            or not 0 < opened.st_size <= _MAX_FILE_BYTES
        ):
            raise ValueError("Analytics credential file ownership, permissions or size invalid")
        text = stream.read(_MAX_FILE_BYTES + 1)
    if len(text) > _MAX_FILE_BYTES:
        raise ValueError("Analytics credential file too large")
    lines = [
        line.strip() for line in text.splitlines() if line.strip() and not line.startswith("#")
    ]
    if len(lines) != 1 or not lines[0].startswith("UPSTOX_ANALYTICS_TOKEN="):
        raise ValueError("Analytics credential file must contain only UPSTOX_ANALYTICS_TOKEN")
    token = lines[0].split("=", 1)[1].strip()
    if not 60 <= len(token) <= 16_384 or not _JWT.fullmatch(token):
        raise ValueError("Analytics credential value has invalid shape")
    return token
