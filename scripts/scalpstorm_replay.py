#!/usr/bin/env python3
"""Offline, data-only ScalpStorm X historical replay. Never places orders."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from atlas.paper.scalpstorm import DataNotReady, load_minute_csv, load_universe, replay


def main() -> int:
    parser = argparse.ArgumentParser(description="Fail-closed ScalpStorm X paper backtest")
    parser.add_argument("--minute-csv", type=Path, required=True)
    parser.add_argument("--universe-json", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        bars, minute_sha = load_minute_csv(args.minute_csv)
        universe, universe_sha = load_universe(args.universe_json)
        result = replay(bars, universe, data_sha256=minute_sha, universe_sha256=universe_sha)
    except DataNotReady as exc:
        print(f"NOT READY — no P&L report produced: {exc}", file=sys.stderr)
        return 2
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(f"20 sessions complete; evidence written to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
