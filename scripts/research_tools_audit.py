"""Offline, read-only pilots of DuckDB, bt and skfolio against recorded Atlas evidence.

Run with .venv-research/bin/python. No providers, downloads, orders or optimised allocations.
Synthetic self-checks validate mechanics only; they never certify market performance.
"""

from __future__ import annotations

import argparse
import contextlib
import hashlib
import io
import json
import os
import sqlite3
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from typing import Any


def read_snapshot(path: Path) -> dict[str, Any]:
    path = path.expanduser().absolute()
    if path.is_symlink() or not path.is_file():
        raise ValueError("An existing regular ledger is required")
    with sqlite3.connect(path.as_uri() + "?mode=ro", uri=True, timeout=5) as db:
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA query_only=ON")
        db.execute("BEGIN")
        return {
            name: [dict(row) for row in db.execute(f"SELECT * FROM {name} ORDER BY 1,2")]  # noqa: S608 - fixed internal names
            for name in ("strategies", "fills", "quotes")
        }


def duckdb_audit(snapshot: dict[str, Any]) -> dict[str, Any]:
    import duckdb
    import pandas as pd

    con = duckdb.connect(config={"enable_external_access": False})
    try:
        for name in ("strategies", "fills", "quotes"):
            con.register(name, pd.DataFrame(snapshot[name]))
        missing = con.execute("""
            SELECT COUNT(*) FROM fills f JOIN strategies s ON f.strategy_id=s.id
            LEFT JOIN quotes q ON q.symbol=s.symbol AND q.source_ts=f.source_ts
            WHERE q.source_ts IS NULL
        """).fetchone()[0]
        summaries = con.execute("""
            SELECT strategy_id, COUNT(*) fills, SUM(fee_paise) fees_paise,
                   MIN(source_ts) first_ts, MAX(source_ts) last_ts
            FROM fills GROUP BY strategy_id ORDER BY strategy_id
        """).fetchall()
        if missing:
            raise ValueError("A recorded fill lacks a source quote")
        return {
            "engine": "DuckDB",
            "missingSourceQuotes": missing,
            "accounts": [
                dict(
                    zip(
                        ("strategyId", "fills", "feesPaise", "firstAtUnix", "lastAtUnix"),
                        row,
                        strict=True,
                    )
                )
                for row in summaries
            ],
        }
    finally:
        con.close()


def bt_replay(account: dict[str, Any], fills: list[dict[str, Any]]) -> dict[str, Any]:
    """Independent float replay of actual recorded execution prices, quantities and fees."""
    import bt
    import pandas as pd

    if not fills or Decimal(account["units"]) != 0:
        raise ValueError("Pilot requires a flat recorded account with fills")
    rows = sorted(fills, key=lambda f: f["source_ts"])
    events = {pd.Timestamp(f["source_ts"], unit="s", tz="UTC"): f for f in rows}
    if len(events) != len(rows):
        raise ValueError("Duplicate fill timestamps")
    prices = pd.DataFrame(
        {"asset": [float(f["price"]) for f in rows]},
        index=pd.DatetimeIndex(events),
    )
    current = {"fee": 0.0}

    class Replay(bt.Algo):
        def __call__(self, target: Any) -> bool:
            fill = events.get(target.now)
            if fill:
                current["fee"] = fill["fee_paise"] / 100
                quantity = float(fill["quantity"]) * (1 if fill["side"] == "BUY" else -1)
                target["asset"].transact(quantity)
            return True

    strategy = bt.Strategy(account["id"], [Replay()], children=[bt.core.Security("asset")])
    backtest = bt.Backtest(
        strategy,
        prices,
        initial_capital=account["initial_paise"] / 100,
        commissions=lambda quantity, price: current["fee"],
        integer_positions=False,
        progress_bar=False,
    )
    with contextlib.redirect_stdout(io.StringIO()):
        bt.run(backtest)
    # bt retains fractional paise; Atlas rounds each execution notional half-up.
    # Compute that declared currency-model difference without fitting to final equity.
    rounding = Decimal(0)
    for fill in rows:
        raw = Decimal(fill["quantity"]) * Decimal(fill["price"]) * 100
        rounded = raw.quantize(Decimal(1), rounding=ROUND_HALF_UP)
        rounding += raw - rounded if fill["side"] == "BUY" else rounded - raw
    raw_final = Decimal(str(backtest.strategy.value)) * 100
    final = int((raw_final + rounding).quantize(Decimal(1), rounding=ROUND_HALF_UP))
    if abs(final - account["cash_paise"]) > 1:
        raise ValueError("Independent bt replay differs after declared execution rounding")
    return {
        "strategyId": account["id"],
        "recordedFills": len(rows),
        "recordedFeesPaise": sum(f["fee_paise"] for f in rows),
        "btRawFinalEquityPaise": str(raw_final),
        "notionalRoundingAdjustmentPaise": str(rounding),
        "btFinalEquityPaise": final,
        "recordedCashPaise": account["cash_paise"],
        "differencePaise": final - account["cash_paise"],
        "scope": (
            "Recorded fills replayed; this does not independently backtest signals "
            "or certify profitability"
        ),
    }


def validation_plan(daily_observations: int) -> dict[str, Any]:
    # A declared research minimum, not a universal statistical sufficiency claim.
    minimum = 252
    if daily_observations < minimum:
        return {
            "status": "INSUFFICIENT_DAILY_HISTORY",
            "observedDailyRows": daily_observations,
            "requiredDailyRows": minimum,
            "walkForwardResults": None,
            "purgedCVResults": None,
            "profitable": None,
        }
    import numpy as np
    from skfolio.model_selection import CombinatorialPurgedCV, WalkForward

    x = np.zeros((daily_observations, 2))
    walk = list(WalkForward(train_size=126, test_size=21, purged_size=5).split(x))
    purge = list(CombinatorialPurgedCV(n_folds=6, n_test_folds=2, purged_size=5).split(x))
    for train, test in walk:
        if len(train) == 0 or len(test) == 0 or max(train) >= min(test) - 4:
            raise ValueError("Chronological train/test separation failed")
    return {
        "status": "SPLIT_PLAN_ONLY",
        "observedDailyRows": daily_observations,
        "requiredDailyRows": minimum,
        "walkForwardFolds": len(walk),
        "combinatorialPurgedSplits": len(purge),
        "purgeRows": 5,
        "walkForwardResults": None,
        "purgedCVResults": None,
        "profitable": None,
        "warning": (
            "CPCV may train later than a test fold; it is a diagnostic, not forward evidence"
        ),
    }


def run(path: Path) -> dict[str, Any]:
    from zoneinfo import ZoneInfo

    from atlas.runtime.local_ledger import report

    reconciled = report(path)
    if not all(account["accountingVerified"] for account in reconciled["accounts"]):
        raise ValueError("Core ledger reconciliation failed")
    snapshot = read_snapshot(path)
    encoded = json.dumps(snapshot, sort_keys=True, separators=(",", ":")).encode()
    audit = duckdb_audit(snapshot)
    replay = []
    dates: dict[str, set[str]] = {}
    for quote in snapshot["quotes"]:
        dates.setdefault(quote["symbol"], set()).add(
            datetime.fromtimestamp(quote["source_ts"], ZoneInfo("Asia/Kolkata")).date().isoformat()
        )
    for account in snapshot["strategies"]:
        replay.append(
            bt_replay(
                account,
                [fill for fill in snapshot["fills"] if fill["strategy_id"] == account["id"]],
            )
        )
    observations = min((len(days) for days in dates.values()), default=0)
    return {
        "schema": "atlas.offline-research-tools.v1",
        "checkedAt": datetime.now(UTC).isoformat(),
        "source": "Owner Mac recorded INR paper ledger",
        "sourceSnapshotSha256": hashlib.sha256(encoded).hexdigest(),
        "sourceMutated": False,
        "realOrdersEnabled": False,
        "syntheticResultsIncluded": False,
        "duckdb": audit,
        "bt": replay,
        "skfolio": validation_plan(observations),
        "nseSessionsCertified": 0,
        "warning": (
            "Existing accounts remain risk halted. Losses are preserved; "
            "no replacement strategy is qualified."
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ledger", type=Path, default=Path.home() / ".atlas/live-paper.sqlite3")
    parser.add_argument("--output", type=Path, default=Path(".atlas-runtime/research-audit.json"))
    parser.add_argument("--self-check", action="store_true")
    args = parser.parse_args()
    if args.self_check:
        sample = {
            "id": "synthetic-mechanics-only",
            "initial_paise": 10000000,
            "cash_paise": 10019600,
            "units": "0",
        }
        fills = [
            {
                "source_ts": 1700000000,
                "side": "BUY",
                "quantity": "2",
                "price": "100",
                "fee_paise": 200,
            },
            {
                "source_ts": 1700000010,
                "side": "SELL",
                "quantity": "2",
                "price": "200",
                "fee_paise": 200,
            },
        ]
        result = {
            "scope": "SYNTHETIC_MECHANICS_ONLY",
            "bt": bt_replay(sample, fills),
            "skfolio": validation_plan(280),
            "insufficient": validation_plan(7),
        }
    else:
        result = run(args.ledger)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temp = args.output.with_suffix(".tmp")
    with temp.open("w", encoding="utf8") as stream:
        os.chmod(temp, 0o600)
        json.dump(result, stream, indent=2)
        stream.write("\n")
    temp.replace(args.output)
    print(
        json.dumps(
            {"output": str(args.output), "schema": result.get("schema", result.get("scope"))}
        )
    )


if __name__ == "__main__":
    main()
