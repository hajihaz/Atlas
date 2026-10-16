#!/usr/bin/env python3
"""Certify three archived out-of-sample periods without claiming live paper evidence."""
from __future__ import annotations

import dataclasses
import json
from pathlib import Path

from atlas.common.hashing import content_hash
from atlas.operations_hardening import _atomic_private_json
from atlas.paper.historical_cohorts import verify_disjoint_historical_cohorts

ROOT = Path(__file__).resolve().parents[1]


def run() -> int:
    evidence = verify_disjoint_historical_cohorts(ROOT / "Lean/Data/equity/usa/daily")
    if len(evidence.cohorts) != 3 or any(item.sessions != 125 for item in evidence.cohorts):
        raise RuntimeError("expected three independent 125-session archived cohorts")
    report = dataclasses.asdict(evidence)
    output = ROOT / "artifacts/historical-cohorts.json"
    _atomic_private_json(output, {"data": report, "hash": content_hash(report)})
    persisted = json.loads(output.read_text())
    if content_hash(persisted["data"]) != persisted["hash"]:
        raise RuntimeError("historical cohort artifact hash mismatch")
    print(
        "HISTORICAL COHORT CERTIFICATION: PASS "
        "(3 disjoint windows, 125 sessions each, archived data only)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
