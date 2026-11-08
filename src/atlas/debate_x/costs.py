"""Conservative Indian cash-equity paper-fill model. No network or broker APIs.

Rates are configurable estimates, NOT the definitive current broker/tax schedule.
The model includes charges and adverse spread/slippage/impact for each side.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_CEILING, ROUND_DOWN, ROUND_HALF_UP, Decimal

from .evidence import EvidenceError

CENT = Decimal("0.01")
TICK = Decimal("0.05")
ZERO = Decimal("0")
ONE = Decimal("1")
TEN_THOUSAND = Decimal("10000")


def paisa(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class IndiaCostModel:
    """Indicative Indian equity intraday charge schedule and bounded fill friction."""

    brokerage_rate_pct: Decimal = Decimal("0.03")
    brokerage_cap_inr: Decimal = Decimal("20")
    stt_sell_pct: Decimal = Decimal("0.025")
    exchange_txn_pct: Decimal = Decimal("0.00297")
    sebi_per_crore: Decimal = Decimal("10")
    stamp_buy_pct: Decimal = Decimal("0.003")
    gst_pct: Decimal = Decimal("18")
    spread_bps: Decimal = Decimal("4")
    slippage_bps: Decimal = Decimal("3")
    impact_bps_per_pct_bar: Decimal = Decimal("2")
    max_bar_participation: Decimal = Decimal("0.05")

    def __post_init__(self) -> None:
        values = vars(self).values()
        if any(not value.is_finite() or value < 0 for value in values):
            raise EvidenceError("invalid/non-finite fee or slippage setting")
        if not ZERO < self.max_bar_participation <= ONE:
            raise EvidenceError("invalid maximum bar participation")
        if self.spread_bps + self.slippage_bps >= TEN_THOUSAND:
            raise EvidenceError("unbounded execution friction")

    def fill_price(self, quoted: Decimal, side: str, shares: int, volume: Decimal) -> Decimal:
        if side not in {"BUY", "SELL"} or shares < 1 or volume <= ZERO:
            raise EvidenceError("fill requires side, quantity and genuine positive bar volume")
        participation_pct = Decimal(shares) * Decimal("100") / volume
        bps = (
            self.spread_bps / 2
            + self.slippage_bps
            + self.impact_bps_per_pct_bar * participation_pct
        )
        premium = quoted * bps / TEN_THOUSAND
        adjusted = quoted + premium if side == "BUY" else quoted - premium
        if adjusted <= ZERO:
            raise EvidenceError("adverse simulated fill price nonpositive")
        units = adjusted / TICK
        rounding = ROUND_CEILING if side == "BUY" else ROUND_DOWN
        return units.to_integral_value(rounding=rounding) * TICK

    def charges(self, side: str, shares: int, fill: Decimal) -> Decimal:
        if side not in {"BUY", "SELL"} or shares <= 0 or fill <= ZERO:
            raise EvidenceError("invalid charge inputs")
        turnover = Decimal(shares) * fill
        brokerage = min(paisa(turnover * self.brokerage_rate_pct / 100), self.brokerage_cap_inr)
        exchange = turnover * self.exchange_txn_pct / 100
        sebi = turnover * self.sebi_per_crore / Decimal("10000000")
        gst = (brokerage + exchange + sebi) * self.gst_pct / 100
        stt = turnover * self.stt_sell_pct / 100 if side == "SELL" else ZERO
        stamp = turnover * self.stamp_buy_pct / 100 if side == "BUY" else ZERO
        return paisa(brokerage + exchange + sebi + gst + stt + stamp)

    def simulate(
        self,
        budget: Decimal,
        entry: Decimal,
        exit_: Decimal,
        entry_volume: Decimal,
        exit_volume: Decimal,
    ) -> dict[str, str | int]:
        """Long only, cash/cost bounded, strictly at or under ₹10,000 simulated stake."""
        if budget <= ZERO or min(entry, exit_, entry_volume, exit_volume) <= ZERO:
            raise EvidenceError("missing price, capital or bar volume")
        cap = min(
            (budget / entry).to_integral_value(rounding=ROUND_DOWN),
            (entry_volume * self.max_bar_participation).to_integral_value(rounding=ROUND_DOWN),
            (exit_volume * self.max_bar_participation).to_integral_value(rounding=ROUND_DOWN),
        )
        qty = int(cap)
        while qty > 0:
            buy = self.fill_price(entry, "BUY", qty, entry_volume)
            buy_cost = self.charges("BUY", qty, buy)
            paid = Decimal(qty) * buy + buy_cost
            if paid <= budget:
                break
            qty -= 1
        if qty < 1:
            return {
                "shares": 0,
                "pnl_inr": "0.00",
                "charges_inr": "0.00",
                "entry_fill_inr": "0",
                "exit_fill_inr": "0",
            }
        sell = self.fill_price(exit_, "SELL", qty, exit_volume)
        sell_cost = self.charges("SELL", qty, sell)
        pnl = Decimal(qty) * (sell - buy) - buy_cost - sell_cost
        return {
            "shares": qty,
            "pnl_inr": str(paisa(pnl)),
            "charges_inr": str(paisa(buy_cost + sell_cost)),
            "entry_fill_inr": str(buy),
            "exit_fill_inr": str(sell),
        }
