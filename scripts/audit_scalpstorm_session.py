#!/usr/bin/env python3
"""Run a private read-only session audit. This script has no token or order authority."""

from __future__ import annotations

import argparse
import datetime as dt
import sqlite3
from pathlib import Path

from atlas.integrations.nse_observer import private_directory, save_snapshot
from atlas.paper.scalpstorm_audit import audit_session


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state-dir", required=True, type=Path)
    parser.add_argument("--date")
    args = parser.parse_args()
    private_directory(args.state_dir)
    try:
        result = audit_session(args.state_dir, args.date)
    except (ValueError, KeyError, OSError, TypeError, sqlite3.Error) as error:
        result = {
            "schema": "atlas.scalpstorm-audit.v1",
            "strategyId": "scalpstorm_x_0940",
            "verifiedAt": dt.datetime.now(dt.UTC).isoformat(),
            "paperOnly": True,
            "realOrdersEnabled": False,
            "actualCapitalINR": 0,
            "accountingVerified": False,
            "sessionAccepted": False,
            "qualified": False,
            "status": "AUDIT_FAILED",
            "reason": type(error).__name__,
        }
    save_snapshot(args.state_dir / "scalpstorm-audit.json", result)
    if result.get("sessionDate"):
        folder = args.state_dir / "scalpstorm-audits"
        private_directory(folder)
        save_snapshot(folder / (result["sessionDate"] + ".json"), result)
    print(result["status"], flush=True)
    return 0 if result["accountingVerified"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
