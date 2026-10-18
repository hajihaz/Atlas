"""Real closed-candle admission checks using only synthetic test evidence."""

import datetime as dt
from dataclasses import replace
from decimal import Decimal

import pytest

from atlas.market.closed_candles import ClosedCandleQualityGate, ClosedResearchCandle


NOW = dt.datetime(2026, 10, 18, 8, 0, 30, tzinfo=dt.UTC)


def candle(*, opened: dt.datetime | None = None) -> ClosedResearchCandle:
    start = opened or NOW.replace(second=0) - dt.timedelta(minutes=1)
    return ClosedResearchCandle(
        symbol="BTC/USD", provider="Kraken public OHLC",
        opened_at=start, closed_at=start + dt.timedelta(minutes=1),
        received_at=NOW, open=Decimal("70000"), high=Decimal("70100"),
        low=Decimal("69900"), close=Decimal("70010"),
        volume=Decimal("5.3"), trade_count=42,
    )


def test_closed_minute_bar_admits_causal_research_data() -> None:
    ClosedCandleQualityGate().admit(candle())


@pytest.mark.parametrize("bad", ["NaN", "Infinity", "-3", "0"])
def test_bad_close_price_rejected(bad: str) -> None:
    with pytest.raises(ValueError, match="OHLC"):
        ClosedCandleQualityGate().admit(replace(candle(), close=Decimal(bad)))


def test_missing_source_rejected() -> None:
    with pytest.raises(ValueError, match="provenance"):
        ClosedCandleQualityGate().admit(replace(candle(), provider=""))


def test_future_and_stale_candles_rejected() -> None:
    base = candle()
    for received in (
        base.closed_at - dt.timedelta(seconds=1),
        base.closed_at + dt.timedelta(minutes=11),
    ):
        with pytest.raises(ValueError, match="future-dated or stale"):
            ClosedCandleQualityGate().admit(replace(base, received_at=received))


def test_ohlc_consistency_enforced() -> None:
    for bad in (
        replace(candle(), high=Decimal("69999")),
        replace(candle(), low=Decimal("70100")),
    ):
        with pytest.raises(ValueError):
            ClosedCandleQualityGate().admit(bad)


def test_interval_length_and_timezone_must_be_valid() -> None:
    with pytest.raises(ValueError, match="interval"):
        ClosedCandleQualityGate().admit(
            replace(candle(), closed_at=candle().closed_at + dt.timedelta(seconds=1))
        )
    with pytest.raises(ValueError, match="timezone"):
        ClosedCandleQualityGate().admit(
            replace(candle(), received_at=NOW.replace(tzinfo=None))
        )


def test_missing_duplicate_or_out_of_order_bars_refused() -> None:
    older = candle(opened=NOW.replace(second=0) - dt.timedelta(minutes=2))
    latest = candle()
    ClosedCandleQualityGate().admit(latest, previous=older)
    with pytest.raises(ValueError, match="missing, duplicate or out-of-order"):
        ClosedCandleQualityGate().admit(latest, previous=latest)
    with pytest.raises(ValueError, match="missing, duplicate or out-of-order"):
        ClosedCandleQualityGate().admit(
            latest, previous=candle(opened=older.opened_at - dt.timedelta(minutes=1))
        )


def test_never_infers_trades_from_source_data() -> None:
    assert not hasattr(ClosedCandleQualityGate(), "place_order")
    assert not hasattr(ClosedCandleQualityGate(), "simulate_fill")
    assert not hasattr(candle(), "broker_order_id")


def test_bad_volume_and_trade_counts_rejected() -> None:
    cases = [
        replace(candle(), volume=Decimal("-1")),
        replace(candle(), trade_count=-1),
        replace(candle(), trade_count=True),
    ]
    for case in cases:
        with pytest.raises(ValueError, match="volume"):
            ClosedCandleQualityGate().admit(case)
