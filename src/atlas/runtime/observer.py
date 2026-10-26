"""Scheduled owner-local reporting and push dispatch. Never runs trading signals."""

from __future__ import annotations

import argparse
import json
import os
import signal
import subprocess
import time
from pathlib import Path
from typing import Any

from atlas.runtime.local_ledger import report

ROOT = Path(__file__).resolve().parents[3]
STATE = ROOT / ".atlas-runtime"
NODE = Path("/opt/homebrew/opt/node@24/bin/node")


def atomic(name: str, value: dict[str, Any]) -> None:
    STATE.mkdir(mode=0o700, exist_ok=True)
    if STATE.is_symlink():
        raise ValueError("Unsafe private state")
    path = STATE / name
    temp = STATE / (name + ".tmp")
    with temp.open("w", encoding="utf8") as stream:
        os.chmod(temp, 0o600)
        json.dump(value, stream)
    temp.replace(path)


def observe() -> dict[str, Any]:
    source = Path(
        os.environ.get("ATLAS_PAPER_DB_PATH", str(Path.home() / ".atlas/live-paper.sqlite3"))
    )
    try:
        if os.environ.get("ATLAS_PAPER_RISK_GUARD") == "1":
            from atlas.runtime.risk_guard import enforce

            enforce(source)
        result = report(source)
        atomic("mac-paper-report.json", result)
        from atlas.runtime.analytics import observed_daily_drawdown

        atomic(
            "observed-metrics.json",
            {
                "accounts": [observed_daily_drawdown(a) for a in result["accounts"]],
                "realOrdersEnabled": False,
            },
        )
        source_fresh = all(a["markFresh"] for a in result["accounts"])
        health = {
            "status": "verified" if source_fresh else "accounting_verified_source_stale",
            "accountingVerified": True,
            "sourceFresh": source_fresh,
            "sourceFeedStatus": result["runtime"]["status"],
            "asOf": result["asOf"],
            "accounts": len(result["accounts"]),
            "realOrdersEnabled": False,
        }
    except Exception:
        health = {
            "status": "accounting_or_source_unavailable",
            "checkedAt": int(time.time()),
            "realOrdersEnabled": False,
        }
    atomic("observer-status.json", health)
    return health


def dispatch_push() -> dict[str, Any]:
    if os.environ.get("ATLAS_IPO_ALERTS_APPROVED") != "1":
        return {"status": "disabled"}
    p = subprocess.run(  # noqa: S603 - fixed reviewed Node executable and script
        [str(NODE), str(ROOT / "scripts/send_ipo_push.mjs")],
        cwd=ROOT,
        env={
            "PATH": "/opt/homebrew/opt/node@24/bin:/usr/bin:/bin",
            "ATLAS_IPO_ALERTS_APPROVED": "1",
        },
        capture_output=True,
        text=True,
        timeout=55,
        check=False,
    )
    if p.returncode:
        return {"status": "sender_unavailable"}
    result: dict[str, Any] = json.loads(p.stdout)
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("once", "run"))
    args = parser.parse_args()
    if args.action == "once":
        print(json.dumps(observe()))
        return
    from apscheduler.schedulers.background import (  # type: ignore[import-untyped]
        BackgroundScheduler,
    )

    scheduler = BackgroundScheduler(timezone="Asia/Kolkata")
    scheduler.add_job(
        observe,
        "interval",
        seconds=20,
        id="read-only-report",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=5,
    )
    scheduler.add_job(
        dispatch_push,
        "interval",
        minutes=1,
        id="ipo-push",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=10,
    )
    stopping = False

    def stop(signum: int, frame: Any) -> None:
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    observe()
    scheduler.start()
    try:
        while not stopping:
            time.sleep(1)
    finally:
        scheduler.shutdown(wait=True)


if __name__ == "__main__":
    main()
