"""ScalpStorm tests use fake candles ONLY; no synthetic P&L published to dashboard."""

from __future__ import annotations

import datetime as dt
import json
from decimal import Decimal
from pathlib import Path

import pytest

from atlas.paper.scalpstorm import (
    IST,
    POSITION_MINUTES,
    RANK_MINUTES,
    SESSIONS,
    D,
    DataNotReady,
    MinuteBar,
    load_minute_csv,
    load_universe,
    replay,
)


def test_exact_2026_sessions_and_holiday():
    assert len(SESSIONS) == 20
    assert SESSIONS[0] == dt.date(2026, 9, 18)
    assert SESSIONS[-1] == dt.date(2026, 10, 16)
    assert dt.date(2026, 10, 2) not in SESSIONS


def test_fail_closed_without_real_data(tmp_path: Path):
    with pytest.raises(DataNotReady, match="missing"):
        load_minute_csv(tmp_path / "nonexistent.csv")
    with pytest.raises(DataNotReady, match="missing"):
        load_universe(tmp_path / "nonexistent.json")


def test_reject_bad_timestamp_and_duplicate(tmp_path: Path):
    f = tmp_path / "m.csv"
    header = "symbol,timestamp,open,high,low,close,volume\n"
    row = "ABC,2026-09-18T09:15:00,100,101,99,100,5\n"
    f.write_text(header + row)
    with pytest.raises(DataNotReady, match="timezone"):
        load_minute_csv(f)
    row = "ABC,2026-09-18T09:15:00+05:30,100,101,99,100,5\n"
    f.write_text(header + row + row)
    with pytest.raises(DataNotReady, match="duplicate"):
        load_minute_csv(f)


def test_universe_must_be_complete_and_preopen(tmp_path: Path):
    path = tmp_path / "universe.json"
    path.write_text(
        json.dumps(
            {
                "captured_before_market_open": False,
                "exchange": "NSE",
                "segment": "CASH",
                "sessions": {},
            }
        )
    )
    with pytest.raises(DataNotReady, match="before"):
        load_universe(path)
    path.write_text(
        json.dumps(
            {
                "captured_before_market_open": True,
                "exchange": "NSE",
                "segment": "CASH",
                "sessions": {},
            }
        )
    )
    with pytest.raises(DataNotReady, match="all 20"):
        load_universe(path)


def _bar(
    symbol: str,
    day: dt.date,
    when: dt.time,
    *,
    volume: int = 100,
    close: str = "100",
    low: str = "100",
    high: str = "100",
) -> MinuteBar:
    return MinuteBar(
        symbol=symbol,
        timestamp=dt.datetime.combine(day, when, tzinfo=IST),
        open=D("100"),
        high=D(high),
        low=D(low),
        close=D(close),
        volume=volume,
    )


def _fixture() -> tuple[list[MinuteBar], dict[dt.date, tuple[str, ...]]]:
    symbols = tuple(f"STK{i:02d}" for i in range(10))
    all_bars: list[MinuteBar] = []
    universe: dict[dt.date, tuple[str, ...]] = {}
    for day in SESSIONS:
        universe[day] = symbols
        for i, s in enumerate(symbols):
            for m in RANK_MINUTES:
                all_bars.append(_bar(s, day, m, volume=100 + i))
            for m in POSITION_MINUTES:
                all_bars.append(_bar(s, day, m))
        for i, m in enumerate(RANK_MINUTES):
            all_bars.append(_bar("NIFTY", day, m, close="101" if i == 14 else "100"))
    return all_bars, universe


def test_point_in_time_rank_20_sessions_and_no_real_orders():
    bars, universe = _fixture()
    report = replay(bars, universe, data_sha256="fake-aaa", universe_sha256="fake-bbb")
    assert report["sessions"] == 20
    assert report["result_type"] == "RESEARCH_UNVERIFIED_INPUT_NO_REAL_ORDERS"
    assert len(report["daily"]) == 20
    day = report["daily"][0]
    assert day["market_direction"] == "BUY"
    assert day["ranked_top_ten"][0] == "STK09"
    assert len(day["trades"]) == 10
    assert all(t["exit_reason"] == "15:00_TIME_EXIT" for t in day["trades"])
    assert Decimal(day["net_pnl"]) < 0  # brokerage and slippage


def test_missing_one_opening_minute_blocks_all_results():
    bars, universe = _fixture()
    bars = [
        b
        for b in bars
        if not (
            b.timestamp.date() == SESSIONS[3]
            and b.symbol == "STK05"
            and b.timestamp.time() == RANK_MINUTES[3]
        )
    ]
    with pytest.raises(DataNotReady, match="missing opening"):
        replay(bars, universe, data_sha256="x", universe_sha256="y")


def test_missing_one_execution_minute_blocks_all_results():
    bars, universe = _fixture()
    bars = [
        b
        for b in bars
        if not (
            b.timestamp.date() == SESSIONS[3]
            and b.symbol == "STK05"
            and b.timestamp.time() == POSITION_MINUTES[2]
        )
    ]
    with pytest.raises(DataNotReady, match="incomplete"):
        replay(bars, universe, data_sha256="x", universe_sha256="y")


def test_no_trade_if_nifty_flat():
    bars, universe = _fixture()
    bars = [
        MinuteBar(b.symbol, b.timestamp, b.open, b.high, b.low, D("100"), b.volume)
        if b.symbol == "NIFTY"
        else b
        for b in bars
    ]
    report = replay(bars, universe, data_sha256="x", universe_sha256="y")
    assert all(d["market_direction"] == "NO_TRADE" and d["trades"] == [] for d in report["daily"])
    assert report["total_net_pnl"] == "0"


def test_stop_loss_triggers_on_intraminute_low():
    bars, universe = _fixture()
    day = SESSIONS[0]
    idx = next(
        i
        for i, b in enumerate(bars)
        if b.symbol == "STK09"
        and b.timestamp.date() == day
        and b.timestamp.time() == POSITION_MINUTES[1]
    )
    b = bars[idx]
    bars[idx] = MinuteBar(b.symbol, b.timestamp, b.open, b.high, D("95"), b.close, b.volume)
    report = replay(bars, universe, data_sha256="x", universe_sha256="y")
    trade = next(t for t in report["daily"][0]["trades"] if t["symbol"] == "STK09")
    assert trade["exit_reason"] == "STOP_LOSS"
    assert Decimal(trade["net_pnl"]) < 0


def test_past_0930_future_volume_cannot_change_selection():
    bars, universe = _fixture()
    # Only change minute volume after decision cutoff.
    bars = [
        MinuteBar(b.symbol, b.timestamp, b.open, b.high, b.low, b.close, 999999999)
        if b.symbol == "STK00" and b.timestamp.time() == POSITION_MINUTES[0]
        else b
        for b in bars
    ]
    report = replay(bars, universe, data_sha256="x", universe_sha256="y")
    assert report["daily"][0]["ranked_top_ten"][0] == "STK09"
