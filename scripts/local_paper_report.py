"""Print the same owner-local read-only report consumed by Atlas UI and MCP."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from atlas.runtime.local_ledger import report, trade_day


def main() -> None:
    path = Path(
        os.environ.get("ATLAS_PAPER_DB_PATH", str(Path.home() / ".atlas/live-paper.sqlite3"))
    )
    parser = argparse.ArgumentParser()
    parser.add_argument("--strategy")
    parser.add_argument("--date")
    parser.add_argument("--offset", type=int, default=0)
    args = parser.parse_args()
    try:
        data = (
            trade_day(path, args.strategy, args.date, args.offset)
            if args.strategy and args.date
            else report(path)
        )
        print(json.dumps(data, separators=(",", ":")))
    except Exception:
        # No paths, raw database values or environment information in HTTP errors.
        raise SystemExit("Local paper accounting is unavailable or failed verification") from None


if __name__ == "__main__":
    main()
