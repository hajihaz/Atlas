#!/usr/bin/env python3
"""Resumable private, rate-bounded historical capture of the current cash universe.

This does not establish historical membership or redistribute broker data.
"""

from __future__ import annotations

import argparse
import datetime as dt
import gzip
import hashlib
import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import quote

from atlas.integrations.credentials import read_analytics_credential
from atlas.integrations.nse_observer import acquire_lock, private_directory, save_snapshot
from atlas.integrations.nse_sources import _parse_bars
from atlas.market.read_only_transport import ReadOnlyServiceError, market_data_get


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--upstox-credential-file", required=True, type=Path)
    p.add_argument("--state-dir", required=True, type=Path)
    p.add_argument("--from-date", required=True, type=dt.date.fromisoformat)
    p.add_argument("--to-date", required=True, type=dt.date.fromisoformat)
    args = p.parse_args()
    if (
        not dt.date(2022, 1, 1) <= args.from_date <= args.to_date < dt.datetime.now(dt.UTC).date()
        or (args.to_date - args.from_date).days > 30
    ):
        raise ValueError("one completed month of genuine history required")
    private_directory(args.state_dir)
    universe = json.loads((args.state_dir / "scalpstorm-universe.json").read_text())
    token = read_analytics_credential(args.upstox_credential_file)
    folder = (
        args.state_dir
        / "scalpstorm-history-source"
        / (str(args.from_date) + "_" + str(args.to_date))
    )
    private_directory(folder)
    save_snapshot(folder / "universe.json", universe)
    guard, stopped = threading.Lock(), threading.Event()
    next_request = [0.0]
    counts = {"captured": 0, "cached": 0, "failed": 0, "candles": 0}
    started = dt.datetime.now(dt.UTC).isoformat()

    def checkpoint() -> None:
        save_snapshot(
            folder / "progress.json",
            {
                "schema": "atlas.owner-history-capture.v1",
                "startedAt": started,
                "updatedAt": dt.datetime.now(dt.UTC).isoformat(),
                "fromDate": str(args.from_date),
                "toDate": str(args.to_date),
                "eligibleCount": len(universe["instruments"]),
                **counts,
                "complete": counts["captured"] + counts["cached"] == len(universe["instruments"]),
                "historicalPointInTimeUniverse": False,
                "realOrdersEnabled": False,
                "methodology": "Current-universe research only; dated membership unavailable",
            },
        )

    def capture(row: dict) -> None:
        key = row["instrumentKey"]
        file = folder / (hashlib.sha256(key.encode()).hexdigest() + ".json.gz")
        try:
            if file.exists():
                if file.is_symlink() or file.stat().st_size > 8_000_000:
                    raise ValueError("unsafe historical cache")
                with gzip.open(file, "rt") as stream:
                    saved = json.load(stream)
                if (
                    saved.get("instrumentKey") != key
                    or saved.get("universeHash") != universe["payloadSHA256"]
                ):
                    raise ValueError("historical identity mismatch")
                candles = saved["response"]["data"]["candles"]
                size = len(_parse_bars(candles, epoch=False)) if candles else 0
                with guard:
                    counts["cached"] += 1
                    counts["candles"] += size
                    checkpoint()
                return
            if stopped.is_set():
                return
            # At most ~1,566 history requests per rolling 30 minutes, leaving
            # room beneath the provider's 2,000 limit. Three I/O workers only.
            with guard:
                wait = max(0.0, next_request[0] - time.monotonic())
                next_request[0] = max(next_request[0], time.monotonic()) + 1.15
            if stopped.wait(wait):
                return
            url = (
                "https://api.upstox.com/v3/historical-candle/"
                + quote(key, safe="")
                + "/minutes/1/"
                + str(args.to_date)
                + "/"
                + str(args.from_date)
            )
            response = market_data_get(
                url, {"Accept": "application/json", "Authorization": f"Bearer {token}"}
            )
            if (
                not isinstance(response, dict)
                or response.get("status") != "success"
                or not isinstance(response.get("data"), dict)
            ):
                raise ValueError("historical candle source unavailable")
            candles = response["data"].get("candles")
            if not isinstance(candles, list):
                raise ValueError("historical candle rows absent")
            bars = _parse_bars(candles, epoch=False) if candles else []
            envelope = {
                "instrumentKey": key,
                "symbol": row["symbol"],
                "universeHash": universe["payloadSHA256"],
                "observedAt": dt.datetime.now(dt.UTC).isoformat(),
                "fromDate": str(args.from_date),
                "toDate": str(args.to_date),
                "source": "Upstox Analytics V3 / minutes / 1",
                "sourcePayloadSHA256": hashlib.sha256(
                    json.dumps(response, sort_keys=True, separators=(",", ":")).encode()
                ).hexdigest(),
                "response": response,
            }
            temp = file.with_suffix(".tmp")
            with gzip.open(temp, "wt") as stream:
                json.dump(envelope, stream, separators=(",", ":"))
            temp.chmod(0o600)
            temp.replace(file)
            with guard:
                counts["captured"] += 1
                counts["candles"] += len(bars)
                checkpoint()
        except (ValueError, OSError, RuntimeError, KeyError, TypeError) as error:
            with guard:
                counts["failed"] += 1
                checkpoint()
                with (folder / "failures.jsonl").open("a") as stream:
                    json.dump(
                        {
                            "instrumentKey": key,
                            "errorType": type(error).__name__,
                            "httpStatus": getattr(error, "http_status", None),
                        },
                        stream,
                    )
                    stream.write("\n")
            if isinstance(error, ReadOnlyServiceError) and (
                error.owner_action_required or error.http_status == 429
            ):
                stopped.set()

    with acquire_lock(folder / "capture"):
        checkpoint()
        with ThreadPoolExecutor(max_workers=3) as pool:
            list(pool.map(capture, universe["instruments"]))
    return 0 if counts["failed"] == 0 and not stopped.is_set() else 1


if __name__ == "__main__":
    raise SystemExit(main())
