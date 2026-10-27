#!/usr/bin/env python3
"""Persistent private owner paper worker; file input only, no network or token."""

from __future__ import annotations

import argparse
import json
import signal
import stat
import threading
import time
from pathlib import Path

from atlas.integrations.nse_observer import acquire_lock, private_directory, save_snapshot
from atlas.paper.scalpstorm_owner import OwnerStore, digest, millis
from atlas.paper.scalpstorm_reporting import with_period_totals


def archive_input(state_dir: Path, inp: dict, ranking_saved: set[str]) -> None:
    """Retain private source evidence before a paper mutation; never reconstruct it."""
    if not inp.get("market", {}).get("marketOpen"):
        return
    observed = inp["observedAt"]
    stamp = millis(observed)
    folder = state_dir / "scalpstorm-observations" / observed[:10]
    private_directory(folder)
    ranking = inp.get("ranking")
    ranking_hash = digest(ranking) if ranking else None
    if ranking_hash and ranking_hash not in ranking_saved:
        save_snapshot(folder / ("ranking-" + ranking_hash + ".json"), ranking)
        ranking_saved.add(ranking_hash)
    receipt = {
        "schema": "atlas.scalpstorm-source-receipt.v1",
        "inputSHA256": digest(inp),
        "rankingSHA256": ranking_hash,
        "input": {k: v for k, v in inp.items() if k != "ranking"},
    }
    save_snapshot(folder / (str(stamp) + ".json"), receipt)


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--state-dir", type=Path, required=True)
    p.add_argument("--once", action="store_true")
    args = p.parse_args()
    private_directory(args.state_dir)
    stopped = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stopped.set())
    signal.signal(signal.SIGINT, lambda *_: stopped.set())
    with acquire_lock(args.state_dir / "scalpstorm-worker"):
        store = OwnerStore(args.state_dir / "scalpstorm-owner.sqlite3", round(time.time() * 1000))
        last_archived = None
        ranking_saved: set[str] = set()
        try:
            while not stopped.is_set():
                now = round(time.time() * 1000)
                failed = False
                try:
                    file = args.state_dir / "scalpstorm-owner-input.json"
                    info = file.lstat()
                    if (
                        file.is_symlink()
                        or not stat.S_ISREG(info.st_mode)
                        or info.st_mode & 0o077
                        or info.st_size > 8_000_000
                    ):
                        raise ValueError("private bounded input required")
                    inp = json.loads(file.read_text())
                    if inp.get("observedAt") != last_archived:
                        archive_input(args.state_dir, inp, ranking_saved)
                        last_archived = inp.get("observedAt")
                    store.advance(inp, now)
                except (ValueError, KeyError, TypeError, OSError):
                    failed = True
                report = with_period_totals(store.report(now))
                if failed:
                    report = {**report, "status": "SOURCE_UNAVAILABLE"}
                save_snapshot(args.state_dir / "scalpstorm-owner.json", report)
                if report["days"]:
                    folder = args.state_dir / "scalpstorm-days"
                    folder.mkdir(exist_ok=True, mode=0o700)
                    day = report["days"][0]["date"]
                    save_snapshot(
                        folder / (day + ".json"),
                        {**report, "events": [e for e in report["events"] if e["date"] == day]},
                    )
                if args.once:
                    print("Owner paper ledger verified; real orders disabled", flush=True)
                    return 0
                stopped.wait(2)
        finally:
            store.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
