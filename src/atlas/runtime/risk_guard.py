"""Independent owner-local risk veto. Pausing never manufactures an exit fill."""

from __future__ import annotations

import sqlite3
import time
from decimal import Decimal
from pathlib import Path
from typing import Any

from atlas.risk.gate import RiskGate
from atlas.runtime.local_ledger import report


def enforce(path: Path, now: int | None = None) -> dict[str, Any]:
    now = int(time.time()) if now is None else now
    path = path.expanduser().absolute()
    if not path.is_file() or path.is_symlink():
        raise ValueError("Existing regular ledger required")
    db = sqlite3.connect(path, timeout=3, isolation_level=None)
    try:
        db.execute("BEGIN IMMEDIATE")
        # The write lease prevents source fills racing the consistent read-only report.
        before = db.execute("SELECT COUNT(*) FROM fills").fetchone()[0]
        state = report(path, now)
        db.execute("""CREATE TABLE IF NOT EXISTS owner_paper_risk_halts(
          strategy_id TEXT PRIMARY KEY, reason TEXT NOT NULL, at INTEGER NOT NULL)""")
        halted = []
        gate = RiskGate()
        for account in state["accounts"]:
            if account["equityINR"] is None:
                continue
            decision = gate.evaluate(
                {account["symbol"]: Decimal("0")},
                equity=Decimal(str(account["equityINR"])),
                data_fresh=True,
                peak_equity=Decimal(
                    str(account.get("maxObservedPeakINR", account["virtualCapitalINR"]))
                ),
            )
            if "drawdown_limit" not in decision.reasons:
                continue
            db.execute(
                "INSERT OR IGNORE INTO owner_paper_risk_halts VALUES (?,?,?)",
                (account["id"], "drawdown_limit", now),
            )
            db.execute("UPDATE strategies SET active=0,pending='' WHERE id=?", (account["id"],))
            halted.append(account["id"])
        after = db.execute("SELECT COUNT(*) FROM fills").fetchone()[0]
        if before != after:
            raise RuntimeError("Risk observer must not create or remove fills")
        db.commit()
        return {
            "halted": halted,
            "paperFillsBefore": before,
            "paperFillsAfter": after,
            "maxDrawdownLimit": str(gate.limits.max_drawdown),
            "realOrdersEnabled": False,
            "modeledPositionsLiquidated": False,
        }
    except BaseException:
        db.rollback()
        raise
    finally:
        db.close()
