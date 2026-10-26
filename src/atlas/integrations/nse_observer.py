"""Private bounded NSE observer. Quote observation grants no execution authority."""

from __future__ import annotations

import argparse
import datetime as dt
import fcntl
import json
import os
import signal
import stat
import tempfile
import threading
import time
from pathlib import Path
from typing import IO

from atlas.integrations.credentials import read_analytics_credential
from atlas.integrations.nse_snapshot import exchange_status, market_snapshot
from atlas.market.read_only_transport import ReadOnlyServiceError


def private_directory(directory: Path) -> None:
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = directory.lstat()
    if (
        not stat.S_ISDIR(info.st_mode)
        or info.st_uid != os.getuid()
        or info.st_mode & 0o077
    ):
        raise ValueError("NSE state directory must be owner-private and nonsymlink")


def save_snapshot(destination: Path, payload: dict[str, object]) -> None:
    private_directory(destination.parent)
    try:
        info = destination.lstat()
        if (
            not stat.S_ISREG(info.st_mode)
            or info.st_uid != os.getuid()
            or info.st_mode & 0o077
        ):
            raise ValueError("unsafe NSE snapshot destination")
    except FileNotFoundError:
        pass
    descriptor, temporary = tempfile.mkstemp(prefix=".nse-", dir=destination.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, separators=(",", ":"), allow_nan=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, destination)
    finally:
        Path(temporary).unlink(missing_ok=True)


def acquire_lock(destination: Path) -> IO[str]:
    private_directory(destination.parent)
    lock = destination.with_suffix(".lock")
    descriptor = os.open(lock, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(descriptor)
        if (
            not stat.S_ISREG(info.st_mode)
            or info.st_uid != os.getuid()
            or info.st_mode & 0o077
        ):
            raise ValueError("unsafe NSE observer lock")
        handle = os.fdopen(descriptor, "w", encoding="ascii")
    except BaseException:
        os.close(descriptor)
        raise
    try:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BaseException:
        handle.close()
        raise
    return handle


def failure_state(error: Exception, failures: int) -> tuple[dict[str, object], int, bool]:
    service = error if isinstance(error, ReadOnlyServiceError) else None
    owner_gate = service is not None and (
        service.owner_action_required or not service.retryable
    )
    delay = min(300, 2 ** min(8, max(1, failures)))
    if service is not None:
        delay = max(delay, service.retry_after_seconds)
    return (
        {
            "schema": 1,
            "mode": "OWNER_NSE_OBSERVATION",
            "status": "OWNER_ACTION_REQUIRED" if owner_gate else "UNAVAILABLE",
            "observedAt": dt.datetime.now(dt.UTC).isoformat(),
            "httpStatus": service.http_status if service else None,
            "providerCode": service.provider_code if service else None,
            "realOrdersEnabled": False,
            "paperOrdersEnabled": False,
            "actualCapitalINR": 0,
            "quotes": [],
        },
        delay,
        owner_gate,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Owner-local NSE read-only observer")
    parser.add_argument("--upstox-credential-file", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    try:
        token = read_analytics_credential(args.upstox_credential_file)
        lock = acquire_lock(args.output)
    except (OSError, ValueError):
        print("NSE observer requires a private credential/state path or is already running")
        return 0  # Expected owner/configuration gate: do not restart endlessly.
    stopped = threading.Event()

    def stop(_signum: int, _frame: object) -> None:
        stopped.set()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    market: dict[str, object] | None = None
    market_checked = float("-inf")
    failures = 0
    print("NSE read-only observer started; broker and paper orders disabled", flush=True)
    with lock:
        while not stopped.is_set():
            try:
                if market is None or time.monotonic() - market_checked >= 60:
                    market = exchange_status(token=token)
                    market_checked = time.monotonic()
                payload = market_snapshot(token=token, market=market)
                save_snapshot(args.output, payload)
                failures = 0
                delay = 1 if market["marketOpen"] else 60
            except (RuntimeError, ValueError, OSError) as error:
                failures += 1
                payload, delay, owner_gate = failure_state(error, failures)
                try:
                    save_snapshot(args.output, payload)
                except (OSError, ValueError):
                    print("NSE private snapshot could not be written", flush=True)
                    return 0
                print(
                    "NSE observer paused for owner action"
                    if owner_gate else "NSE source unavailable; bounded retry scheduled",
                    flush=True,
                )
                if owner_gate or args.once:
                    return 0
            if args.once:
                print("NSE snapshot saved privately", flush=True)
                return 0
            stopped.wait(delay)
    return 0
