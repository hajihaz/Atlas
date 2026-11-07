"""Debate X safeguards and deterministic hypothetical paper comparison."""

import json
from copy import deepcopy
from decimal import Decimal

import pytest

from atlas.debate_x.cli import run_casefile
from atlas.debate_x.engine import DebateEngine, evaluate_candidate
from atlas.debate_x.evidence import EvidenceError
from atlas.debate_x.providers import APIModel
from atlas.debate_x.shadow import PairedPaperReplay
from atlas.risk.gate import RiskGate, RiskLimits

DECISION = "2026-11-05T09:40:00+05:30"
PREVIOUS = "2026-11-05T09:39:30+05:30"
SETTLED = "2026-11-05T15:15:00+05:30"


def packet(identity="t1", time=DECISION):
    return {
        "schema": 1,
        "mode": "POINT_IN_TIME_PAPER_REPLAY",
        "live_orders_enabled": False,
        "id": identity,
        "snapshot_id": "snap-" + identity,
        "strategy_id": "scalpstorm_x",
        "symbol": "TESTNSE",
        "decision_at": time,
        "entry_price_inr": "500",
        "baseline_intent": "BUY",
        "quote_evidence_id": "q1",
        "evidence": [
            {
                "id": "q1",
                "kind": "quote",
                "source": "broker:read-only-verified",
                "published_at": PREVIOUS,
                "received_at": PREVIOUS,
                "detail": "Verified observed price ₹500",
                "price_inr": "500",
            },
            {
                "id": "v1",
                "kind": "volume",
                "source": "exchange:licensed-archive",
                "published_at": PREVIOUS,
                "received_at": PREVIOUS,
                "detail": "Volume spike observed in completed candle",
            },
        ],
    }


def settlement(identity="t1", price="520", settled=SETTLED):
    return {
        "candidate_id": identity,
        "exit_at": settled,
        "exit_price_inr": price,
        "source": "verified-post-close",
    }


class DeterministicModel:
    """Explicit test fixture, never represented as a connected or profitable LLM."""

    def __init__(self, judge="APPROVE", broken=None):
        self.judge = judge
        self.broken = broken
        self.calls = []

    def complete(self, *, role, instructions, evidence_json):
        self.calls.append((role, instructions, evidence_json))
        if role == self.broken:
            return '{"role":"invalid"}'
        return json.dumps(
            {
                "role": role,
                "stance": {"bull": "SUPPORT", "bear": "OPPOSE", "judge": self.judge}[role],
                "reason": "Test fixture cites prior evidence only.",
                "evidence_ids": ["q1", "v1"],
                "risks": ["Test-only downside risk"],
            }
        )


def test_three_role_orchestration_and_no_orders():
    model = DeterministicModel()
    result = DebateEngine(model).run(packet())
    assert result["status"] == "REVIEWED"
    assert result["decision"] == "APPROVE"
    assert result["shadow_action"] == "PAPER_CANDIDATE"
    assert result["live_orders_enabled"] is False
    assert result["real_orders_placed"] == 0
    assert [row["role"] for row in result["agents"]] == ["bull", "bear", "judge"]
    assert len(model.calls) == 3
    assert len(model.calls[2][2]) > len(model.calls[0][2])


@pytest.mark.parametrize(
    "failure",
    [
        "stale",
        "future",
        "naive",
        "duplicate",
        "no_quote",
        "live_enabled",
        "no_source",
        "negative_price",
    ],
)
def test_invalid_evidence_fails_before_model_invocation(failure):
    data = packet()
    if failure == "stale":
        data["evidence"][0]["received_at"] = "2026-11-05T09:35:00+05:30"
        data["evidence"][0]["published_at"] = "2026-11-05T09:35:00+05:30"
    if failure == "future":
        data["evidence"][1]["received_at"] = "2026-11-05T10:00:00+05:30"
    if failure == "naive":
        data["decision_at"] = "2026-11-05T09:40:00"
    if failure == "duplicate":
        data["evidence"][1]["id"] = "q1"
    if failure == "no_quote":
        data["quote_evidence_id"] = "not-found"
    if failure == "live_enabled":
        data["live_orders_enabled"] = True
    if failure == "no_source":
        data["evidence"][0]["source"] = ""
    if failure == "negative_price":
        data["entry_price_inr"] = "-10"
    model = DeterministicModel()
    result = DebateEngine(model).run(data)
    assert result["decision"] == "SKIP"
    assert result["status"] == "INVALID_EVIDENCE"
    assert model.calls == []


def test_hypothetical_future_cannot_reach_model():
    model = DeterministicModel()
    case = {"candidate": packet(), "closed": settlement(price="550")}
    result = run_casefile({"cases": [case]}, model=model)
    assert result["trade_count"] == 1
    assert result["comparison_valid"] is True
    assert all("550" not in arg[2] for arg in model.calls)
    assert all("exit_price_inr" not in arg[2] for arg in model.calls)


def test_quote_price_binding_blocks_mismatched_entry():
    data = packet()
    data["entry_price_inr"] = "550"
    model = DeterministicModel()
    result = DebateEngine(model).run(data)
    assert result["status"] == "INVALID_EVIDENCE"
    assert "does not match" in result["reasons"][0]
    assert model.calls == []


def test_no_model_never_uses_hindsight():
    data = {"cases": [{"candidate": packet(), "closed": settlement(price="700")}]}
    report = run_casefile(data)
    assert report["comparison_valid"] is False
    assert report["evaluations"][0]["agents"] == []


def test_missing_model_does_not_pretend_to_be_ai():
    result = evaluate_candidate(packet(), None)
    assert result["status"] == "NOT_CONNECTED"
    assert result["agents"] == []
    report = run_casefile({"cases": [{"candidate": packet(), "closed": settlement()}]})
    assert report["connected_model"] is False
    assert report["comparison_valid"] is False
    assert report["status"] == "INCOMPLETE_EVIDENCE"


def test_judge_skip_is_not_overridden():
    report = DebateEngine(DeterministicModel(judge="REJECT")).run(packet())
    assert report["decision"] == "SKIP"
    assert report["judge_stance"] == "REJECT"


def test_fabricated_agent_evidence_fails_closed():
    class BadModel(DeterministicModel):
        def complete(self, *, role, instructions, evidence_json):
            raw = json.loads(
                super().complete(role=role, instructions=instructions, evidence_json=evidence_json)
            )
            raw["evidence_ids"] = ["invented"]
            return json.dumps(raw)

    result = DebateEngine(BadModel()).run(packet())
    assert result["status"] == "AGENT_ERROR"
    assert result["decision"] == "SKIP"


def test_independent_risk_veto_even_when_judge_approves():
    risk = RiskGate(RiskLimits(max_positions=0))
    result = DebateEngine(DeterministicModel(), risk=risk).run(packet())
    assert result["judge_stance"] == "APPROVE"
    assert result["decision"] == "SKIP"
    assert result["risk_approved"] is False
    assert "position_count_limit" in result["reasons"]


def test_paired_paper_books_with_fees_rejected_winner_and_chained_journal():
    replay = PairedPaperReplay()
    first = packet()
    accepted = DebateEngine(DeterministicModel()).run(first)
    row1 = replay.settle(first, accepted, settlement(price="520"))
    second = packet(identity="t2", time="2026-11-06T09:40:00+05:30")
    second["evidence"][0]["published_at"] = "2026-11-06T09:39:45+05:30"
    second["evidence"][0]["received_at"] = "2026-11-06T09:39:45+05:30"
    second["evidence"][1]["published_at"] = "2026-11-06T09:39:45+05:30"
    second["evidence"][1]["received_at"] = "2026-11-06T09:39:45+05:30"
    rejected = DebateEngine(DeterministicModel(judge="REJECT")).run(second)
    row2 = replay.settle(
        second,
        rejected,
        settlement(identity="t2", price="525", settled="2026-11-06T15:15:00+05:30"),
    )
    report = replay.report()
    assert report["trade_count"] == 2
    assert report["approved_count"] == 1
    assert report["missed_profitable_count"] == 1
    assert Decimal(row1["baseline_pnl_inr"]) > 0
    assert Decimal(row2["baseline_pnl_inr"]) > 0
    assert Decimal(row2["filtered_pnl_inr"]) == 0
    assert report["baseline_equity_inr"] != report["filtered_equity_inr"]
    assert row1["chain_hash"] != row2["chain_hash"]
    assert report["real_orders_placed"] == 0


def test_replay_rejects_future_inside_model_and_inconsistent_orders():
    review = DebateEngine(DeterministicModel()).run(packet())
    replay = PairedPaperReplay()
    with pytest.raises(EvidenceError, match="settlement must follow"):
        replay.settle(packet(), review, settlement(settled="2026-11-05T09:39:00+05:30"))
    tampered = deepcopy(review)
    tampered["real_orders_placed"] = 1
    with pytest.raises(EvidenceError, match="live-order"):
        replay.settle(packet(), tampered, settlement())


def test_llm_provider_never_enabled_implicitly(monkeypatch):
    monkeypatch.delenv("ATLAS_DEBATE_ENABLED", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "not-a-real-key")
    monkeypatch.setenv("ATLAS_DEBATE_PROVIDER", "openai")
    monkeypatch.setenv("ATLAS_DEBATE_MODEL", "test")
    with pytest.raises(EvidenceError, match="disabled"):
        APIModel.from_environment()
