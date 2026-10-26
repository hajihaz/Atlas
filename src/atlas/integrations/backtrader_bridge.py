"""Optional independent Backtrader SMA simulator on admitted historical candles.

Signals use completed bars; market orders fill on the subsequent bar, never
on the signal bar. Independent simulation, NOT a replacement for Atlas risk.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from atlas.integrations.nse_sources import HistoricalBatch


@dataclass(frozen=True)
class ComparisonRun:
    source_hash: str
    provider: str
    symbol: str
    bars: int
    initial_cash_inr: Decimal
    ending_equity_inr: Decimal
    completed_orders: int
    status: str = "HYPOTHETICAL_UNCERTIFIED_INSTRUMENT_REPLAY"


def run_backtrader_sma(
    batch: HistoricalBatch,
    *,
    fast: int = 9,
    slow: int = 21,
    initial_cash: Decimal = Decimal("100000"),
    commission_rate: Decimal = Decimal("0.001"),
    slippage_rate: Decimal = Decimal("0.0005"),
) -> ComparisonRun:
    if (
        batch.status != "UNCERTIFIED_INSTRUMENT_HISTORY"
        or not 2 <= fast < slow <= 300
        or len(batch.candles) < slow + 5
        or initial_cash <= 0
        or not initial_cash.is_finite()
        or not Decimal("0") <= commission_rate <= Decimal("0.05")
        or not Decimal("0") <= slippage_rate <= Decimal("0.05")
    ):
        raise ValueError("replay data or parameters not admitted")
    try:
        import backtrader as bt  # type: ignore[import-untyped]
    except ImportError:
        raise RuntimeError("Backtrader optional dependency unavailable") from None

    candles = batch.candles

    class CandleFeed(bt.feed.DataBase):  # type: ignore[misc]
        params = (("timeframe", bt.TimeFrame.Minutes), ("compression", 1))

        def start(self) -> None:
            super().start()
            self.cursor = 0

        def _load(self) -> bool:
            if self.cursor >= len(candles):
                return False
            bar = candles[self.cursor]
            self.cursor += 1
            self.lines.datetime[0] = bt.date2num(bar.timestamp.replace(tzinfo=None))
            self.lines.open[0] = float(bar.open)
            self.lines.high[0] = float(bar.high)
            self.lines.low[0] = float(bar.low)
            self.lines.close[0] = float(bar.close)
            self.lines.volume[0] = bar.volume
            self.lines.openinterest[0] = 0
            return True

    class SmaStrategy(bt.Strategy):  # type: ignore[misc]
        params = (("fast", fast), ("slow", slow))

        def __init__(self) -> None:
            self.cross = bt.ind.CrossOver(
                bt.ind.SMA(self.data.close, period=self.p.fast),
                bt.ind.SMA(self.data.close, period=self.p.slow),
            )
            self.pending: Any = None
            self.fills = 0

        def notify_order(self, order: Any) -> None:
            if order.status == order.Completed:
                self.fills += 1
            if order.status in (
                order.Completed,
                order.Canceled,
                order.Margin,
                order.Rejected,
                order.Expired,
            ):
                self.pending = None

        def next(self) -> None:
            if self.pending:
                return
            if not self.position and self.cross[0] > 0:
                qty = int(self.broker.getcash() * 0.90 / self.data.close[0])
                if qty > 0:
                    self.pending = self.buy(size=qty)
            elif self.position and self.cross[0] < 0:
                self.pending = self.close()

    engine = bt.Cerebro(stdstats=False, runonce=True)
    engine.adddata(CandleFeed())
    engine.addstrategy(SmaStrategy)
    engine.broker.setcash(float(initial_cash))
    engine.broker.setcommission(commission=float(commission_rate))
    engine.broker.set_slippage_perc(float(slippage_rate))
    runs = engine.run()
    return ComparisonRun(
        batch.payload_sha256,
        batch.provider,
        batch.instrument,
        len(candles),
        initial_cash,
        Decimal(str(engine.broker.getvalue())),
        runs[0].fills,
    )
