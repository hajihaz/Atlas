"""Strict read-only cross-vendor historical OHLCV dispute report.

A second provider cannot cure absent rights, late publication, source bias,
non-contemporaneous data or a missing authentic point-in-time trading universe.
No source is designated true and no stored candle is modified automatically.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from decimal import Decimal

from atlas.integrations.history_store import CandleArchive


@dataclass(frozen=True)
class CandleDisagreement:
    timestamp_utc: str
    price_fields: tuple[str, ...]
    volume_differs: bool
    primary_close: str
    secondary_close: str
    primary_volume: int
    secondary_volume: int


@dataclass(frozen=True)
class SourceComparison:
    primary_provider: str
    primary_instrument: str
    secondary_provider: str
    secondary_instrument: str
    interval: str
    primary_observed_bars: int
    secondary_observed_bars: int
    aligned_bars: int
    only_primary_bars: int
    only_secondary_bars: int
    price_disagreement_bars: int
    volume_disagreement_bars: int
    max_close_delta_pct: str | None
    primary_source_payloads: int
    secondary_source_payloads: int
    examples: tuple[CandleDisagreement, ...]
    status: str
    source_rights_verified: bool = False
    point_in_time_universe_verified: bool = False
    write_authority: bool = False


def compare_history_sources(
    archive: CandleArchive,
    *,
    primary_provider: str,
    primary_instrument: str,
    secondary_provider: str,
    secondary_instrument: str,
    interval: str = "1m",
) -> SourceComparison:
    valid = {"upstox_v3", "fyers_v3"}
    if (
        primary_provider not in valid
        or secondary_provider not in valid
        or primary_provider == secondary_provider
        or not primary_instrument
        or not secondary_instrument
        or not interval
    ):
        raise ValueError("explicit, distinct NSE provider and instrument mapping required")
    if not archive.path.is_file():
        raise ValueError("local historical archive unavailable")
    p = archive.rows(primary_provider, primary_instrument, interval)
    s = archive.rows(secondary_provider, secondary_instrument, interval)
    if not p or not s:
        raise ValueError("both exact provider/instrument archives must have candles")

    def keyed(rows: list[tuple[object, ...]]) -> dict[dt.datetime, tuple[object, ...]]:
        result = {}
        for row in rows:
            moment = row[0]
            if not isinstance(moment, dt.datetime) or moment.tzinfo is None:
                raise ValueError("source lacks timezone-aware candle timestamps")
            if moment in result:
                raise ValueError("duplicate source candle timestamp")
            result[moment] = row
        return result

    left = keyed(p)
    right = keyed(s)
    common = sorted(left.keys() & right.keys())
    price_diff = volume_diff = 0
    max_close: Decimal | None = None
    samples: list[CandleDisagreement] = []
    for time in common:
        a, b = left[time], right[time]
        changed_fields = tuple(
            field
            for column, field in enumerate(("open", "high", "low", "close"), 1)
            if Decimal(str(a[column])) != Decimal(str(b[column]))
        )
        volumes_differ = int(str(a[5])) != int(str(b[5]))
        if changed_fields:
            price_diff += 1
        if volumes_differ:
            volume_diff += 1
        if changed_fields or volumes_differ:
            close_a, close_b = Decimal(str(a[4])), Decimal(str(b[4]))
            if close_a <= 0 or close_b <= 0:
                raise ValueError("nonpositive archived historical close")
            discrepancy = abs(close_a - close_b) / close_a * Decimal("100")
            max_close = max(max_close or Decimal("0"), discrepancy)
            if len(samples) < 40:
                samples.append(
                    CandleDisagreement(
                        time.astimezone(dt.UTC).isoformat(),
                        changed_fields,
                        volumes_differ,
                        str(close_a),
                        str(close_b),
                        int(str(a[5])),
                        int(str(b[5])),
                    )
                )
    return SourceComparison(
        primary_provider,
        primary_instrument,
        secondary_provider,
        secondary_instrument,
        interval,
        len(p),
        len(s),
        len(common),
        len(left.keys() - right.keys()),
        len(right.keys() - left.keys()),
        price_diff,
        volume_diff,
        str(max_close) if max_close is not None else None,
        len({str(row[6]) for row in p}),
        len({str(row[6]) for row in s}),
        tuple(samples),
        "UNCERTIFIED_NO_ALIGNED_SOURCE_TIMESTAMPS"
        if not common
        else "UNCERTIFIED_VENDOR_DIFFERENCES_REVIEW_REQUIRED"
        if (price_diff or volume_diff or len(left) != len(common) or len(right) != len(common))
        else "UNCERTIFIED_VENDOR_OBSERVATIONS_AGREE_ON_OVERLAP",
    )
