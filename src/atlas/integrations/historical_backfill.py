"""Bounded, restart-safe historical NSE backfill without unlicensed data inference.

The local archive stores each successful provider chunk. Failure is fail-closed
and the caller must not interpret partially fetched history as complete.
"""

from __future__ import annotations

import datetime as dt
import time
from collections.abc import Callable
from dataclasses import dataclass

from atlas.integrations.history_store import CandleArchive
from atlas.integrations.nse_sources import HistoricalBatch, fyers_history, upstox_history


def date_chunks(
    start: dt.date, end: dt.date, *, provider: str
) -> tuple[tuple[dt.date, dt.date], ...]:
    """Split inclusive NSE date windows without overlap or missing calendar days."""
    max_days = {"upstox": 28, "fyers": 100}.get(provider)
    if max_days is None:
        raise ValueError("unsupported historical provider")
    if start > end or (end - start).days > 3660:
        raise ValueError("invalid or overly broad historical window")
    chunks = []
    cursor = start
    while cursor <= end:
        stop = min(end, cursor + dt.timedelta(days=max_days - 1))
        chunks.append((cursor, stop))
        cursor = stop + dt.timedelta(days=1)
    return tuple(chunks)


@dataclass(frozen=True)
class BackfillSummary:
    provider: str
    instrument: str
    requests: int
    bars_received: int
    bars_added: int
    first_date: dt.date
    last_date: dt.date
    status: str = "UNCERTIFIED_HISTORICAL_ARCHIVE"


Fetch = Callable[[dt.date, dt.date], HistoricalBatch]


def backfill(
    archive: CandleArchive,
    *,
    provider: str,
    instrument: str,
    start: dt.date,
    end: dt.date,
    token: str = "",
    app_id: str = "",
    interval: int = 1,
    pause_seconds: float = 1.0,
    sleeper: Callable[[float], None] = time.sleep,
    fetcher: Fetch | None = None,
) -> BackfillSummary:
    chunks = date_chunks(start, end, provider=provider)
    if not 0 <= pause_seconds <= 10:
        raise ValueError("invalid rate limit delay")
    if fetcher is None:
        if provider == "upstox":
            if not token:
                raise RuntimeError("Upstox Analytics Token unavailable")

            def fetcher(a: dt.date, b: dt.date) -> HistoricalBatch:
                return upstox_history(instrument, a, b, token=token, interval=interval)
        else:
            if not token or not app_id:
                raise RuntimeError("FYERS market-data credentials unavailable")

            def fetcher(a: dt.date, b: dt.date) -> HistoricalBatch:
                return fyers_history(
                    instrument, a, b, app_id=app_id, token=token, interval=interval
                )

    expected_provider = {"upstox": "upstox_v3", "fyers": "fyers_v3"}[provider]
    count = total = added = 0
    for a, b in chunks:
        if count and pause_seconds:
            sleeper(pause_seconds)
        batch = fetcher(a, b)
        # An accidental source substitution or response from the wrong time window
        # may not enter the immutable archive even if its candles look plausible.
        if (
            batch.provider != expected_provider
            or batch.instrument != instrument
            or batch.from_date != a
            or batch.to_date != b
            or batch.interval != f"{interval}m"
        ):
            raise ValueError("historical chunk contract mismatch")
        added += archive.add(batch)
        total += len(batch.candles)
        count += 1
    return BackfillSummary(provider, instrument, count, total, added, start, end)
