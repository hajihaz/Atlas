"""Immutable point-in-time evidence contracts; fail closed on untrusted inputs."""

from __future__ import annotations

import datetime as dt
import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any


class EvidenceError(ValueError):
    """Reject a potentially leaked, unverifiable, or stale decision snapshot."""


def timestamp(value: str) -> dt.datetime:
    if not isinstance(value, str) or "T" not in value:
        raise EvidenceError("timestamps must include date, time, and explicit UTC offset")
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise EvidenceError("invalid timestamp") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise EvidenceError("naive timestamp forbidden")
    return parsed.astimezone(dt.UTC)


def positive_money(value: Any, field: str) -> Decimal:
    if isinstance(value, bool) or not isinstance(value, (int, str, Decimal)):
        raise EvidenceError(field + " must be a decimal amount as string")
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise EvidenceError(field + " must be numeric") from exc
    if not number.is_finite() or number <= 0:
        raise EvidenceError(field + " must be positive and finite")
    return number


@dataclass(frozen=True)
class Evidence:
    id: str
    kind: str
    source: str
    published_at: str
    received_at: str
    detail: str
    price_inr: str | None = None

    @classmethod
    def parse(cls, data: dict[str, Any], decision_at: dt.datetime) -> Evidence:
        if not isinstance(data, dict):
            raise EvidenceError("malformed evidence")
        values = {
            k: data.get(k)
            for k in ("id", "kind", "source", "published_at", "received_at", "detail")
        }
        if any(not isinstance(v, str) or not v.strip() for v in values.values()):
            raise EvidenceError("evidence requires nonempty source, timestamps and detail")
        if not re.fullmatch(r"[A-Za-z0-9_.:-]{1,80}", values["id"]):
            raise EvidenceError("unsafe evidence identifier")
        if values["kind"] not in {"quote", "volume", "trend", "news", "event", "other"}:
            raise EvidenceError("unsupported evidence kind")
        if len(values["source"]) > 400 or len(values["detail"]) > 1200:
            raise EvidenceError("evidence detail too large")
        published, received = timestamp(values["published_at"]), timestamp(values["received_at"])
        if published > received or received > decision_at:
            raise EvidenceError("future/unreceived information detected")
        if values["kind"] == "quote":
            quote_price = positive_money(data.get("price_inr"), "quote price_inr")
            values["price_inr"] = str(quote_price)
        elif "price_inr" in data:
            raise EvidenceError("nonquote evidence cannot assert a quote price")
        return cls(**values)


@dataclass(frozen=True)
class Candidate:
    id: str
    symbol: str
    strategy_id: str
    decision_at: str
    entry_price_inr: Decimal
    evidence: tuple[Evidence, ...]
    quote_evidence_id: str
    baseline_intent: str
    snapshot_id: str

    @classmethod
    def parse(cls, raw: dict[str, Any], *, max_quote_age_seconds: int = 90) -> Candidate:
        if not isinstance(raw, dict) or raw.get("schema") != 1:
            raise EvidenceError("unsupported candidate schema")
        if (
            raw.get("mode") != "POINT_IN_TIME_PAPER_REPLAY"
            or raw.get("live_orders_enabled") is not False
        ):
            raise EvidenceError("paper-only boundary required")
        for key in (
            "id",
            "symbol",
            "strategy_id",
            "decision_at",
            "quote_evidence_id",
            "snapshot_id",
        ):
            if not isinstance(raw.get(key), str) or not raw[key].strip():
                raise EvidenceError("missing or invalid " + key)
        if not re.fullmatch(r"[A-Z0-9._-]{2,30}", raw["symbol"]):
            raise EvidenceError("invalid symbol")
        if not re.fullmatch(r"[A-Za-z0-9_.:-]{1,100}", raw["strategy_id"]):
            raise EvidenceError("invalid strategy ID")
        if raw.get("baseline_intent") != "BUY":
            raise EvidenceError("only long BUY research candidates supported")
        decision_at = timestamp(raw["decision_at"])
        records = raw.get("evidence")
        if not isinstance(records, list) or not 1 <= len(records) <= 32:
            raise EvidenceError("evidence packet requires 1-32 source records")
        evidence = tuple(Evidence.parse(record, decision_at) for record in records)
        ids = [e.id for e in evidence]
        if len(set(ids)) != len(ids):
            raise EvidenceError("duplicate evidence IDs")
        quote = next((e for e in evidence if e.id == raw["quote_evidence_id"]), None)
        if quote is None or quote.kind != "quote":
            raise EvidenceError("missing quote source")
        age = (decision_at - timestamp(quote.received_at)).total_seconds()
        if age < 0 or age > max_quote_age_seconds:
            raise EvidenceError("stale/future price evidence")
        if Decimal(quote.price_inr) != positive_money(
            raw.get("entry_price_inr"), "entry_price_inr"
        ):
            raise EvidenceError("candidate price does not match the dated quote")
        return cls(
            id=raw["id"],
            symbol=raw["symbol"],
            strategy_id=raw["strategy_id"],
            decision_at=raw["decision_at"],
            entry_price_inr=positive_money(raw.get("entry_price_inr"), "entry_price_inr"),
            evidence=evidence,
            quote_evidence_id=raw["quote_evidence_id"],
            baseline_intent="BUY",
            snapshot_id=raw["snapshot_id"],
        )

    def public_view(self) -> dict[str, Any]:
        """Only fields available at decision time. Never include future settlement/outcome."""
        return {
            "candidate_id": self.id,
            "symbol": self.symbol,
            "strategy_id": self.strategy_id,
            "decision_at": self.decision_at,
            "entry_price_inr": str(self.entry_price_inr),
            "snapshot_id": self.snapshot_id,
            "quote_evidence_id": self.quote_evidence_id,
            "evidence": [vars(record) for record in self.evidence],
        }
