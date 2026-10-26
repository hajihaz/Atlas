"""One bounded private collector shared by owner prices and the NSE paper worker."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import signal
import stat
import threading
import time
from pathlib import Path

from atlas.integrations.credentials import read_analytics_credential
from atlas.integrations.nse_observer import (
    acquire_lock,
    failure_state,
    private_directory,
    save_snapshot,
)
from atlas.integrations.nse_pilot_source import (
    fetch_universe,
    intraday_bars,
    pilot_market_snapshot,
    pilot_watchlist,
)
from atlas.integrations.nse_snapshot import WATCHLIST, exchange_status
from atlas.integrations.nse_sources import IST


class PilotIdentityChanged(ValueError):
    """A changed equity identity requires a reviewed portfolio migration."""


def read_private_universe(path: Path) -> dict[str, object]:
    if path.is_symlink():
        raise ValueError("private NSE universe must not be a symlink")
    info = path.stat()
    if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077 or info.st_uid != os.getuid():
        raise ValueError("private NSE universe required")
    if not 0 < info.st_size <= 32768:
        raise ValueError("invalid NSE universe size")
    value = json.loads(path.read_text())
    if not isinstance(value, dict):
        raise ValueError("invalid NSE universe object")
    pilot_watchlist(value)
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--upstox-credential-file", type=Path, required=True)
    parser.add_argument("--universe-file", type=Path, required=True)
    parser.add_argument("--state-dir", type=Path, required=True)
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    private_directory(args.state_dir)
    token = read_analytics_credential(args.upstox_credential_file)
    universe = read_private_universe(args.universe_file)
    watchlist = pilot_watchlist(universe)
    lock = acquire_lock(args.state_dir / "nse-market.json")
    stopped = threading.Event()

    def stop(_signum: int, _frame: object) -> None:
        stopped.set()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    market: dict[str, object] | None = None
    market_checked = float("-inf")
    market_stamp = ""
    history: dict[str, object] = {}
    history_checked = float("-inf")
    universe_date = ""
    failures = 0
    print("NSE fixed-basket collector started; GET data only", flush=True)
    with lock:
        while not stopped.is_set():
            try:
                local_date = dt.datetime.now(IST).date().isoformat()
                if universe_date != local_date:
                    current = fetch_universe()
                    if pilot_watchlist(current) != watchlist:
                        raise PilotIdentityChanged(
                            "pilot identities changed; reviewed migration required"
                        )
                    universe_date = local_date
                    save_snapshot(args.state_dir / "nse-universe-observation.json", current)
                    history = {}
                    history_checked = float("-inf")
                if market is None or time.monotonic() - market_checked >= 60:
                    market = exchange_status(token=token)
                    market_checked = time.monotonic()
                    market_stamp = dt.datetime.now(dt.UTC).isoformat()
                local_now = dt.datetime.now(IST)
                history_session = (
                    local_now.weekday() < 5 and local_now.time() >= dt.time(9, 15)
                )
                if history_session and (not history or (
                    market["marketOpen"] and time.monotonic() - history_checked >= 60
                )):
                    for key, symbol in watchlist.items():
                        if stopped.is_set():
                            break
                        bars = intraday_bars(key, token=token)
                        history[symbol] = {"bars": bars,
                                           "observedAt": dt.datetime.now(dt.UTC).isoformat()}
                    history_checked = time.monotonic()
                snapshot = pilot_market_snapshot(universe, token=token, market=market)
                raw_quotes = snapshot["quotes"]
                if not isinstance(raw_quotes, list):
                    raise ValueError("NSE normalized quotes missing")
                observation = {**snapshot, "quotes": [
                    q for q in raw_quotes if isinstance(q, dict) and q["instrumentKey"] in WATCHLIST
                ]}
                save_snapshot(args.state_dir / "nse-market.json", observation)
                payload = {
                    "schema": "atlas.nse-paper-input.v1", "source": "Upstox Analytics",
                    "dataClass": "BROKER_API_OBSERVATION", "realOrdersEnabled": False,
                    "observedAt": snapshot["observedAt"], "market": market,
                    "marketObservedAt": market_stamp, "universe": universe["instruments"],
                    "universePayloadSHA256": universe["payloadSHA256"],
                    "sourcePayloadSHA256": snapshot["sourcePayloadSHA256"],
                    "quotes": raw_quotes, "history": history,
                }
                save_snapshot(args.state_dir / "nse-paper-input.json", payload)
                failures = 0
                delay = 2 if market["marketOpen"] else 60
                if args.once:
                    print("Private pilot inputs and owner quotes captured", flush=True)
                    return 0
            except (RuntimeError, ValueError, OSError) as error:
                failures += 1
                failure, delay, owner_gate = failure_state(error, failures)
                save_snapshot(args.state_dir / "nse-market.json", failure)
                save_snapshot(args.state_dir / "nse-paper-input.json", {
                    "schema": "atlas.nse-paper-input.v1", "status": "SOURCE_UNAVAILABLE",
                    "realOrdersEnabled": False, "observedAt": dt.datetime.now(dt.UTC).isoformat(),
                })
                print("NSE collector source unavailable; no order authority", flush=True)
                if owner_gate or args.once or isinstance(error, PilotIdentityChanged):
                    return 0
            stopped.wait(delay)
    return 0
