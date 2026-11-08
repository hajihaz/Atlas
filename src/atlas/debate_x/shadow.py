"""Two isolated, virtual INR books; hindsight outcomes NEVER enter the agent prompt."""

from __future__ import annotations

import datetime as dt
import hashlib
import json
from dataclasses import dataclass
from decimal import ROUND_DOWN, Decimal
from typing import Any

from atlas.risk.gate import RiskGate

from .evidence import Candidate, EvidenceError, positive_money, timestamp
from .roles import roles_match_order

INITIAL_CAPITAL = Decimal("100000")
MAX_TRADE = Decimal("10000")
ROUND = Decimal("0.01")


@dataclass(frozen=True)
class ClosedObservation:
    """Exit outcome supplied ONLY after model decision, never to Good Cloud/Bad Cloud/Judge."""

    candidate_id: str
    exit_at: str
    exit_price_inr: Decimal
    source: str

    @classmethod
    def parse(cls, raw: dict[str, Any], candidate: Candidate) -> ClosedObservation:
        if not isinstance(raw, dict) or raw.get("candidate_id") != candidate.id:
            raise EvidenceError("exit observation does not match candidate")
        if not isinstance(raw.get("source"), str) or not raw["source"].strip():
            raise EvidenceError("exit source required")
        if timestamp(raw.get("exit_at", "")) <= timestamp(candidate.decision_at):
            raise EvidenceError("settlement must follow signal")
        return cls(
            candidate.id,
            raw["exit_at"],
            positive_money(raw.get("exit_price_inr"), "exit_price_inr"),
            raw["source"],
        )


def _trade_pnl(entry: Decimal, exit_: Decimal, stake: Decimal, cost: Decimal) -> Decimal:
    """Long-only serial closed-trade replay; fee + slippage are charged per side."""
    qty = (stake / (entry * (Decimal("1") + cost))).to_integral_value(rounding=ROUND_DOWN)
    if qty <= 0:
        return Decimal("0")
    paid = qty * entry * (Decimal("1") + cost)
    received = qty * exit_ * (Decimal("1") - cost)
    return (received - paid).quantize(ROUND)


def _drawdown(values: list[Decimal]) -> Decimal:
    peak = values[0]
    biggest = Decimal("0")
    for value in values:
        peak = max(peak, value)
        if peak:
            biggest = max(biggest, (peak - value) / peak)
    return biggest


class PairedPaperReplay:
    """Paper-only sequential settlement, never interprets AI text as broker instructions."""

    def __init__(
        self,
        *,
        initial_capital: Decimal = INITIAL_CAPITAL,
        max_trade: Decimal = MAX_TRADE,
        cost_per_side: Decimal = Decimal("0.0015"),
        risk_gate: RiskGate | None = None,
    ):
        if (
            initial_capital != INITIAL_CAPITAL
            or max_trade != MAX_TRADE
            or not cost_per_side.is_finite()
            or not 0 <= cost_per_side < Decimal("0.1")
        ):
            raise ValueError("this experiment fixes equal ₹100,000 books and ₹10,000 per trade")
        self.cost = cost_per_side
        self.risk = risk_gate or RiskGate()
        self.baseline = initial_capital
        self.filtered = initial_capital
        self.rows: list[dict[str, Any]] = []
        self.base_curve = [initial_capital]
        self.ai_curve = [initial_capital]
        self.last_decision_time: dt.datetime | None = None
        self.last_exit_time: dt.datetime | None = None
        self.hash_head = "0" * 64
        self.seen_candidates: set[str] = set()

    def settle(
        self, packet: dict[str, Any], review: dict[str, Any], closed: dict[str, Any]
    ) -> dict[str, Any]:
        """Strictly chronological completed outcomes; rejects overlapping serial examples."""
        candidate = Candidate.parse(packet)
        outcome = ClosedObservation.parse(closed, candidate)
        decision_time = timestamp(candidate.decision_at)
        exit_time = timestamp(outcome.exit_at)
        if self.last_decision_time is not None and decision_time <= self.last_decision_time:
            raise EvidenceError("replay inputs must be strictly chronological")
        if self.last_exit_time is not None and decision_time < self.last_exit_time:
            raise EvidenceError("overlapping positions unsupported by serial replay")
        if review.get("candidate_id") != candidate.id or review.get("schema") != 1:
            raise EvidenceError("review mismatch")
        if review.get("live_orders_enabled") is not False or review.get("real_orders_placed") != 0:
            raise EvidenceError("live-order field violates paper boundary")
        if review.get("mode") != "SHADOW_PAPER_ONLY":
            raise EvidenceError("only shadow reviews permitted")
        if candidate.id in self.seen_candidates:
            raise EvidenceError("duplicate paper candidate")
        if review.get("status") == "REVIEWED":
            if (
                review.get("snapshot_id") != candidate.snapshot_id
                or review.get("strategy_id") != candidate.strategy_id
                or review.get("symbol") != candidate.symbol
                or review.get("decision_time") != candidate.decision_at
            ):
                raise EvidenceError("review is not bound to the original evidence packet")
            agents = review.get("agents")
            if not roles_match_order(agents):
                raise EvidenceError("missing or malformed Good Cloud/Bad Cloud/Judge attestations")
            if any(not isinstance(a, dict) or not a.get("evidence_ids") for a in agents):
                raise EvidenceError("unreferenced agent argument")
            if (
                review.get("judge_stance") != agents[2].get("stance")
                or review.get("decision") not in {"APPROVE", "SKIP"}
                or (review.get("decision") == "APPROVE" and review.get("judge_stance") != "APPROVE")
            ):
                raise EvidenceError("inconsistent judge or paper decision")
        if review.get("status") not in {
            "REVIEWED",
            "AGENT_ERROR",
            "NOT_CONNECTED",
            "BLOCKED",
            "INVALID_EVIDENCE",
        }:
            raise EvidenceError("unknown review status")
        approved = (
            review["status"] == "REVIEWED"
            and review.get("decision") == "APPROVE"
            and review.get("shadow_action") == "PAPER_CANDIDATE"
            and review.get("risk_approved") is True
        )
        gate_base = self.risk.evaluate(
            {candidate.symbol: Decimal("0.10")},
            equity=self.baseline,
            data_fresh=True,
            kill_switch=False,
        )
        gate_ai = self.risk.evaluate(
            {candidate.symbol: Decimal("0.10")},
            equity=self.filtered,
            data_fresh=True,
            kill_switch=False,
        )
        base_pnl = (
            _trade_pnl(
                candidate.entry_price_inr,
                outcome.exit_price_inr,
                min(MAX_TRADE, self.baseline),
                self.cost,
            )
            if gate_base.approved
            else Decimal("0")
        )
        ai_pnl = (
            _trade_pnl(
                candidate.entry_price_inr,
                outcome.exit_price_inr,
                min(MAX_TRADE, self.filtered),
                self.cost,
            )
            if approved and gate_ai.approved
            else Decimal("0")
        )
        self.baseline += base_pnl
        self.filtered += ai_pnl
        self.base_curve.append(self.baseline)
        self.ai_curve.append(self.filtered)
        self.last_decision_time, self.last_exit_time = decision_time, exit_time
        self.seen_candidates.add(candidate.id)
        row = {
            "candidate_id": candidate.id,
            "strategy_id": candidate.strategy_id,
            "symbol": candidate.symbol,
            "decision_at": candidate.decision_at,
            "exit_at": outcome.exit_at,
            "source": outcome.source,
            "baseline_pnl_inr": str(base_pnl),
            "filtered_pnl_inr": str(ai_pnl),
            "baseline_equity_inr": str(self.baseline),
            "filtered_equity_inr": str(self.filtered),
            "ai_decision": review.get("decision", "SKIP"),
            "review_status": review["status"],
            "ai_risk_approved": bool(approved and gate_ai.approved),
            "missed_profitable_trade": (not approved and base_pnl > 0),
        }
        self.hash_head = hashlib.sha256(
            (self.hash_head + json.dumps(row, sort_keys=True, separators=(",", ":"))).encode()
        ).hexdigest()
        row["chain_hash"] = self.hash_head
        self.rows.append(row)
        return row

    def report(self) -> dict[str, Any]:
        valid = bool(self.rows) and all(row["review_status"] == "REVIEWED" for row in self.rows)
        return {
            "schema": 1,
            "mode": "CLOSED_TRADE_PAPER_REPLAY",
            "status": "REPLAY_COMPLETE" if valid else "INCOMPLETE_EVIDENCE",
            "certified_forward": False,
            "comparison_valid": valid,
            "live_orders_enabled": False,
            "real_orders_placed": 0,
            "initial_capital_inr": str(INITIAL_CAPITAL),
            "max_trade_inr": str(MAX_TRADE),
            "cost_per_side": str(self.cost),
            "trade_count": len(self.rows),
            "reviewed_count": sum(row["review_status"] == "REVIEWED" for row in self.rows),
            "approved_count": sum(row["ai_risk_approved"] for row in self.rows),
            "missed_profitable_count": sum(row["missed_profitable_trade"] for row in self.rows),
            "baseline_equity_inr": str(self.baseline),
            "filtered_equity_inr": str(self.filtered),
            "baseline_max_drawdown_pct": str((_drawdown(self.base_curve) * 100).quantize(ROUND)),
            "filtered_max_drawdown_pct": str((_drawdown(self.ai_curve) * 100).quantize(ROUND)),
            "equity_curve": [
                {"step": i, "baseline_inr": str(a), "filtered_inr": str(b)}
                for i, (a, b) in enumerate(zip(self.base_curve, self.ai_curve, strict=True))
            ],
            "ledger_chain_head": self.hash_head,
            "rows": self.rows,
            "disclaimer": (
                "Sequential closed-trade hypothetical replay, not certified NSE "
                "forward fills; excludes overlapping positions."
            ),
        }
