#!/usr/bin/env python3
"""Reproduce an ARCHIVED historical fixture replay; never a live-paper claim."""

from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import json
from pathlib import Path

from atlas.common.hashing import content_hash
from atlas.operations_hardening import _atomic_private_json
from atlas.paper.historical_replay import replay_lean_history

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sessions", type=int, default=30)
    parser.add_argument("--start", type=dt.date.fromisoformat, default=dt.date(2013, 10, 7))
    args = parser.parse_args()
    report = replay_lean_history(
        ROOT / "Lean/Data/equity/usa/daily",
        start=args.start,
        sessions=args.sessions,
    )
    body = {
        "source_kind": report.source_kind,
        "session_count": report.sessions,
        "decision_and_fill_dates": report.dates,
        "input_archive_sha256": report.source_hashes,
        "source_snapshot_hash": report.snapshot_hash,
        "equity_path": [str(x) for x in report.equity_path],
        "evidence": dataclasses.asdict(report.envelope),
        "policy": "HISTORICAL REPLAY ONLY; NOT SUSTAINED REAL-MARKET PAPER EVIDENCE",
    }
    payload = {"body": body, "sha256": content_hash(body)}
    output = ROOT / "artifacts/historical-paper-replay.json"
    _atomic_private_json(output, payload)
    loaded = json.loads(output.read_text())
    if content_hash(loaded["body"]) != loaded["sha256"]:
        raise RuntimeError("historical replay evidence output changed during write")
    print(
        f"HISTORICAL REPLAY PASS ({report.sessions} archived sessions; "
        f"equity_end={report.equity_path[-1]}; "
        f"ledger={report.evidence.ledger_head[1][:12]}; "
        f"evidence_hash={report.envelope.evidence_hash[:12]})"
    )
    print(f"Historical-only output: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
