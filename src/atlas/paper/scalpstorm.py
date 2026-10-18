"""ScalpStorm X v1: fail-closed, point-in-time NSE intraday research replay.

No network access, credentials, broker adapter or order side effects. Data must contain
the COMPLETE as-of opening universe per session; end-of-day volume is prohibited.
All timestamps are the START of 1-minute candles in Asia/Kolkata.
"""

from __future__ import annotations

import csv
import datetime as dt
import hashlib
import json
from dataclasses import dataclass, field
from decimal import ROUND_FLOOR, Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

from atlas.data.calendars.nse_calendar import TradingCalendar

IST = ZoneInfo("Asia/Kolkata")
START = dt.date(2026, 9, 18)
END = dt.date(2026, 10, 16)
D = Decimal
ONE = D("1")
TRADE_START = dt.time(9, 40)
TRADE_END = dt.time(15, 0)
RANK_END = dt.time(9, 29)
OPEN_TIME = dt.time(9, 15)
NIFTY = "NIFTY"
NSE_HOLIDAYS_2026_IN_WINDOW = frozenset({dt.date(2026, 10, 2)})
SESSIONS = tuple(
    TradingCalendar(
        "NSE-CM-2026-official-window",
        NSE_HOLIDAYS_2026_IN_WINDOW,
        covered_from=START,
        covered_to=END,
    ).sessions_in_range(START, END)
)


class DataNotReady(ValueError):
    """The run is blocked: required historical evidence is absent/ambiguous."""


@dataclass(frozen=True)
class MinuteBar:
    symbol: str
    timestamp: dt.datetime
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: int


@dataclass(frozen=True)
class Rules:
    capital: Decimal = field(default_factory=lambda: D("100000"))
    positions: int = 10
    stop_fraction: Decimal = field(default_factory=lambda: D("0.02"))
    direction_threshold: Decimal = field(default_factory=lambda: D("0.0015"))
    slippage_bps: Decimal = field(default_factory=lambda: D("5"))

    def __post_init__(self) -> None:
        if self.capital <= 0 or self.positions < 1:
            raise ValueError("invalid capital/positions")
        if not (0 < self.stop_fraction < 1) or self.slippage_bps < 0:
            raise ValueError("invalid stop/slippage")


def expected_minutes(start: dt.time, end: dt.time) -> tuple[dt.time, ...]:
    current = dt.datetime.combine(START, start)
    last = dt.datetime.combine(START, end)
    out: list[dt.time] = []
    while current <= last:
        out.append(current.time())
        current += dt.timedelta(minutes=1)
    return tuple(out)


RANK_MINUTES = expected_minutes(OPEN_TIME, RANK_END)
POSITION_MINUTES = expected_minutes(TRADE_START, TRADE_END)


def load_minute_csv(path: Path) -> tuple[list[MinuteBar], str]:
    """Read only explicit +05:30 timestamped 1-minute OHLCV from a local file."""
    if not path.is_file():
        raise DataNotReady("one-minute OHLCV file missing")
    raw = path.read_bytes()
    out: list[MinuteBar] = []
    keys: set[tuple[str, dt.datetime]] = set()
    required = {"symbol", "timestamp", "open", "high", "low", "close", "volume"}
    try:
        reader = csv.DictReader(raw.decode("utf-8-sig").splitlines())
        if reader.fieldnames is None or set(reader.fieldnames) != required:
            raise DataNotReady("CSV requires exactly symbol,timestamp,open,high,low,close,volume")
        for row in reader:
            stamp = dt.datetime.fromisoformat(row["timestamp"])
            if stamp.tzinfo is None or stamp.utcoffset() != dt.timedelta(hours=5, minutes=30):
                raise DataNotReady("timestamps must be timezone-aware IST (+05:30)")
            if stamp.second or stamp.microsecond:
                raise DataNotReady("one-minute bar timestamp must have zero seconds")
            symbol = row["symbol"].strip().upper()
            if not symbol or not symbol.replace("-", "").replace("&", "").isalnum():
                raise DataNotReady("invalid symbol")
            prices = [D(row[k]) for k in ("open", "high", "low", "close")]
            if any(not p.is_finite() or p <= 0 for p in prices):
                raise DataNotReady("bad/non-finite OHLC price")
            op, hi, lo, cl = prices
            if lo > min(op, cl) or hi < max(op, cl) or lo > hi:
                raise DataNotReady("OHLC inconsistency")
            volume = int(row["volume"])
            if volume < 0:
                raise DataNotReady("negative volume")
            key = (symbol, stamp)
            if key in keys:
                raise DataNotReady("duplicate symbol/minute")
            keys.add(key)
            out.append(MinuteBar(symbol, stamp, op, hi, lo, cl, volume))
    except (UnicodeError, KeyError, ValueError, ArithmeticError, TypeError) as exc:
        if isinstance(exc, DataNotReady):
            raise
        raise DataNotReady("malformed one-minute OHLCV input") from exc
    return out, hashlib.sha256(raw).hexdigest()


def load_universe(path: Path) -> tuple[dict[dt.date, tuple[str, ...]], str]:
    """Point-in-time eligible universe, captured before 09:15 for every session.

    Manifest is deliberately separate from traded names: a list of winners alone
    cannot establish that the stock-selection screen had full coverage.
    """
    if not path.is_file():
        raise DataNotReady("point-in-time universe manifest missing")
    raw = path.read_bytes()
    try:
        obj = json.loads(raw)
        if obj["captured_before_market_open"] is not True:
            raise DataNotReady("universe must be captured before each session")
        if obj["exchange"] != "NSE" or obj["segment"] != "CASH":
            raise DataNotReady("only NSE cash equity universe is accepted")
        days = obj["sessions"]
        if set(days) != {d.isoformat() for d in SESSIONS}:
            raise DataNotReady("universe manifest does not cover exactly all 20 sessions")
        output: dict[dt.date, tuple[str, ...]] = {}
        for day in SESSIONS:
            symbols = days[day.isoformat()]
            if (
                not isinstance(symbols, list)
                or len(symbols) < 10
                or len(symbols) != len(set(symbols))
                or NIFTY in symbols
                or any(not isinstance(s, str) or not s.isupper() for s in symbols)
            ):
                raise DataNotReady("invalid/incomplete session universe")
            output[day] = tuple(symbols)
    except (KeyError, TypeError, json.JSONDecodeError) as exc:
        raise DataNotReady("malformed point-in-time universe manifest") from exc
    return output, hashlib.sha256(raw).hexdigest()


def groww_intraday_charges(notional_buy: Decimal, notional_sell: Decimal) -> Decimal:
    """Published Groww NSE intraday rates, estimated per complete buy+sell roundtrip.

    Charge rounding, levies and applicable rules may differ from broker contract note.
    GST on brokerage, exchange, SEBI and IPFT charges; no GST on STT/stamp.
    """

    def brokerage(notional: Decimal) -> Decimal:
        return min(D("20"), max(min(D("5"), notional * D("0.025")), notional * D("0.001")))

    base = brokerage(notional_buy) + brokerage(notional_sell)
    turnover = notional_buy + notional_sell
    exchange = turnover * D("0.0000297")
    sebi = turnover * D("0.000001")
    ipft = turnover * D("0.000001")
    gst = (base + exchange + sebi + ipft) * D("0.18")
    stt = notional_sell * D("0.00025")
    stamp = notional_buy * D("0.00003")
    return base + exchange + sebi + ipft + gst + stt + stamp


def replay(
    bars: list[MinuteBar],
    universe: dict[dt.date, tuple[str, ...]],
    *,
    rules: Rules | None = None,
    data_sha256: str,
    universe_sha256: str,
) -> dict[str, object]:
    """Returns 20-session audit trail only if ALL coverage checks pass.

    Direction is determined from NIFTY opening-bar open and 09:29-bar close.
    Candidates ranked strictly on volumes timestamped 09:15..09:29.
    Fill at 09:40 bar OPEN, and close at 15:00 bar OPEN.
    """
    rules = rules or Rules()
    if set(universe) != set(SESSIONS):
        raise DataNotReady("missing session universe")
    by_day: dict[dt.date, dict[str, dict[dt.time, MinuteBar]]] = {}
    for bar in bars:
        date = bar.timestamp.date()
        if date not in SESSIONS:
            raise DataNotReady("minute bar outside approved window")
        by_day.setdefault(date, {}).setdefault(bar.symbol, {})[bar.timestamp.time()] = bar
    reports: list[dict[str, object]] = []
    cumulative = D("0")
    for date in SESSIONS:
        daily = by_day.get(date, {})
        expected = universe[date]
        if set(daily) != set(expected) | {NIFTY}:
            raise DataNotReady(f"{date}: missing/extra symbols; broad universe must be complete")
        for symbol in expected:
            item = daily[symbol]
            if not set(RANK_MINUTES).issubset(item):
                raise DataNotReady(f"{date} {symbol}: missing opening minute volumes")
        nifty = daily[NIFTY]
        if not set(RANK_MINUTES).issubset(nifty):
            raise DataNotReady(f"{date}: missing NIFTY opening minutes")
        opening = nifty[OPEN_TIME].open
        momentum = (nifty[RANK_END].close / opening) - ONE
        direction = (
            "BUY"
            if momentum > rules.direction_threshold
            else "SELL"
            if momentum < -rules.direction_threshold
            else "NO_TRADE"
        )
        volumes = {
            symbol: sum(daily[symbol][minute].volume for minute in RANK_MINUTES)
            for symbol in expected
        }
        selected = sorted(expected, key=lambda s: (-volumes[s], s))[: rules.positions]
        if len(selected) < rules.positions or any(volumes[s] <= 0 for s in selected):
            raise DataNotReady(f"{date}: insufficient liquid ranked candidates")
        trades: list[dict[str, object]] = []
        day_net = D("0")
        if direction != "NO_TRADE":
            allocation = rules.capital / D(rules.positions)
            for symbol in selected:
                candles = daily[symbol]
                if not set(POSITION_MINUTES).issubset(candles):
                    raise DataNotReady(f"{date} {symbol}: incomplete 09:40-15:00 replay")
                entry_open = candles[TRADE_START].open
                slip = rules.slippage_bps / D(10000)
                reference_entry = entry_open * (ONE + slip if direction == "BUY" else ONE - slip)
                shares = (allocation / reference_entry).to_integral_value(rounding=ROUND_FLOOR)
                if shares < 1:
                    raise DataNotReady(f"{date} {symbol}: cannot purchase one share")
                buy = direction == "BUY"
                entry = entry_open * (ONE + slip if buy else ONE - slip)
                stop = entry * (ONE - rules.stop_fraction if buy else ONE + rules.stop_fraction)
                exit_open = candles[TRADE_END].open
                reason = "15:00_TIME_EXIT"
                for minute in POSITION_MINUTES[:-1]:
                    candle = candles[minute]
                    triggered = candle.low <= stop if buy else candle.high >= stop
                    if triggered:
                        # If the candle opened beyond stop, take the worse open.
                        exit_open = min(stop, candle.open) if buy else max(stop, candle.open)
                        reason = "STOP_LOSS"
                        break
                exit_price = exit_open * (ONE - slip if buy else ONE + slip)
                notional_buy = shares * (entry if buy else exit_price)
                notional_sell = shares * (exit_price if buy else entry)
                gross = shares * (exit_price - entry if buy else entry - exit_price)
                fees = groww_intraday_charges(notional_buy, notional_sell)
                pnl = gross - fees
                day_net += pnl
                trades.append(
                    {
                        "symbol": symbol,
                        "side": direction,
                        "opening_volume": volumes[symbol],
                        "shares": int(shares),
                        "entry": str(entry),
                        "exit": str(exit_price),
                        "exit_reason": reason,
                        "gross_pnl": str(gross),
                        "estimated_charges": str(fees),
                        "net_pnl": str(pnl),
                    }
                )
        cumulative += day_net
        reports.append(
            {
                "date": date.isoformat(),
                "market_direction": direction,
                "nifty_open_move": str(momentum),
                "ranked_top_ten": selected,
                "trades": trades,
                "net_pnl": str(day_net),
                "cumulative_net_pnl": str(cumulative),
            }
        )
    return {
        "strategy": "scalpstorm-x-pit-v1",
        "result_type": "RESEARCH_UNVERIFIED_INPUT_NO_REAL_ORDERS",
        "capital": str(rules.capital),
        "sessions": len(reports),
        "date_start": START.isoformat(),
        "date_end": END.isoformat(),
        "data_sha256": data_sha256,
        "universe_sha256": universe_sha256,
        "rules": {
            "direction_threshold": str(rules.direction_threshold),
            "stop_fraction": str(rules.stop_fraction),
            "slippage_bps_per_side": str(rules.slippage_bps),
            "selection_cutoff_ist": "09:30",
            "execution_ist": "09:40",
            "exit_ist": "15:00",
            "max_leverage": "1x",
        },
        "daily": reports,
        "total_net_pnl": str(cumulative),
        "final_capital": str(rules.capital + cumulative),
        "data_note": "External data and universe require independent provider provenance",
    }
