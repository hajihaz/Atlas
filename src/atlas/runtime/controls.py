"""Owner-local paper controls: allowlisted state changes with durable idempotency."""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import time
from pathlib import Path
from typing import Any


def set_active(
    path: Path, strategy_id: str, active: bool, request_id: str, *, authorized: bool = False
) -> dict[str, Any]:
    if not authorized:
        raise PermissionError("Owner-local paper control is not enabled")
    if type(active) is not bool or not re.fullmatch(r"[a-z0-9-]{1,48}", strategy_id):
        raise ValueError("Invalid paper command")
    if not re.fullmatch(r"[a-zA-Z0-9-]{16,80}", request_id):
        raise ValueError("A stable request ID is required")
    path = path.expanduser().absolute()
    if not path.is_file() or path.is_symlink():
        raise ValueError("Existing regular paper ledger required")
    digest = hashlib.sha256(json.dumps([strategy_id, active]).encode()).hexdigest()
    db = sqlite3.connect(path, timeout=3, isolation_level=None)
    try:
        db.execute("BEGIN IMMEDIATE")
        found = db.execute("SELECT symbol FROM strategies WHERE id=?", (strategy_id,)).fetchone()
        if found is None or found[0] not in ("BTCINR", "ETHINR"):
            raise ValueError("Unknown paper strategy")
        if (
            active
            and db.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='owner_paper_risk_halts'"
            ).fetchone()
        ):
            if db.execute(
                "SELECT 1 FROM owner_paper_risk_halts WHERE strategy_id=?", (strategy_id,)
            ).fetchone():
                raise PermissionError(
                    "Risk-halted account requires an independent owner review before reset"
                )
        db.execute("""CREATE TABLE IF NOT EXISTS owner_paper_controls (
          request_id TEXT PRIMARY KEY, digest TEXT NOT NULL,
          result TEXT NOT NULL, created_at INTEGER NOT NULL)""")
        old = db.execute(
            "SELECT digest,result FROM owner_paper_controls WHERE request_id=?", (request_id,)
        ).fetchone()
        if old:
            if old[0] != digest:
                raise ValueError("Request ID already used for another command")
            db.rollback()
            previous: dict[str, Any] = json.loads(old[1])
            return previous
        db.execute(
            "UPDATE strategies SET active=?,pending='' WHERE id=?", (int(active), strategy_id)
        )
        result = {
            "strategyId": strategy_id,
            "active": active,
            "requestId": request_id,
            "mode": "PAPER_ONLY",
            "realOrdersEnabled": False,
            "pendingIntentCleared": True,
        }
        db.execute(
            "INSERT INTO owner_paper_controls VALUES (?,?,?,?)",
            (request_id, digest, json.dumps(result), int(time.time())),
        )
        db.commit()
        return result
    except BaseException:
        db.rollback()
        raise
    finally:
        db.close()
