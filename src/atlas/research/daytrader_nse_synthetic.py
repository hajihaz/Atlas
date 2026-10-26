"""Deterministic 5-minute synthetic fixture ONLY for Day Trader Skill research.

The prices and outcomes here are constructed examples; never label this
source as NSE market observations or as licensed intraday history.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal as D

from atlas.research.daytrader_nse import IST, Candle5m


def synthetic_session(day: dt.date, *, scenario: str = "target") -> tuple[Candle5m, ...]:
    if scenario not in {"target", "stop", "both", "no_breakout", "flat"}:
        raise ValueError("unknown synthetic fixture scenario")
    result = []
    start = dt.datetime.combine(day, dt.time(9, 15), tzinfo=IST)
    for i in range(75):
        stamp = start + dt.timedelta(minutes=i * 5)
        op, high, low, close = D("103"), D("104"), D("102.5"), D("103")
        if i < 3:
            op, high, low, close = D("100"), D("102"), D("98"), D("100")
        elif i == 3:
            if scenario == "no_breakout":
                op, high, low, close = D("100"), D("101"), D("99"), D("100")
            else:
                op, high, low, close = D("100"), D("104"), D("99"), D("103")
        elif i == 5:
            if scenario == "target":
                op, high, low, close = D("103"), D("106"), D("102.5"), D("105")
            elif scenario == "stop":
                op, high, low, close = D("103"), D("104"), D("101"), D("101.5")
            elif scenario == "both":
                op, high, low, close = D("103"), D("106"), D("101"), D("103")
        result.append(
            Candle5m(
                "SYNTH",
                stamp,
                stamp + dt.timedelta(minutes=5, seconds=2),
                op,
                high,
                low,
                close,
                i * 10,
            )
        )
    return tuple(result)
