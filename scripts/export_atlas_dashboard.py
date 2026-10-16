#!/usr/bin/env python3
"""Publish safe, aggregate offline certification data to the static demo UI.

Never exports account data, order tables, credentials, audit logs or file paths.
"""

from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

from atlas.common.hashing import content_hash

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    manifest = json.loads((ROOT / "artifacts/certification-manifest.json").read_text())
    replay = json.loads((ROOT / "artifacts/historical-paper-replay.json").read_text())
    cohorts = json.loads((ROOT / "artifacts/historical-cohorts.json").read_text())
    if content_hash(replay["body"]) != replay["sha256"]:
        raise ValueError("historical replay evidence mismatch")
    if content_hash(cohorts["data"]) != cohorts["hash"]:
        raise ValueError("cohort evidence mismatch")
    m = manifest["manifest"]
    r = replay["body"]
    c = cohorts["data"]
    if not r["source_kind"].endswith("not_live_paper"):
        raise ValueError("refuse to publish unreviewed broker data")
    if not c["source_kind"].endswith("not_live_paper"):
        raise ValueError("refuse to publish live or unknown source")
    if len(r["equity_path"]) != r["session_count"]:
        raise ValueError("truncated replay session evidence")
    dates = r["decision_and_fill_dates"]
    snapshot = {
        "source": "archived_lean_fixture_not_live_paper",
        "mode": "OFFLINE / READ ONLY",
        "revision": m["git_sha"][:8],
        "certifiedAt": m["timestamp_utc"],
        "testsPassed": m["tests_passed"],
        "testsSkippedLocal": m["tests_skipped"],
        "leanGoldenFixtures": len(m["lean_fixtures"]),
        "certificationGates": 17,
        "historical": [
            {"session": i + 1, "date": dates[i + 1], "equity": float(Decimal(value))}
            for i, value in enumerate(r["equity_path"])
        ],
        "historicalInitialCapital": 100000,
        "cohorts": [
            {
                "start": row["start"],
                "sessions": row["sessions"],
                "finalEquity": float(Decimal(row["final_equity"])),
            }
            for row in c["cohorts"]
        ],
        "researchSourceHash": r["source_snapshot_hash"][:12],
        "liveCapitalBlocked": True,
    }
    out = ROOT / "frontend/src/data/snapshot.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(snapshot, indent=2) + "\n")
    print(
        f"Public demo snapshot: {len(snapshot['historical'])} historical sessions, no broker data"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
