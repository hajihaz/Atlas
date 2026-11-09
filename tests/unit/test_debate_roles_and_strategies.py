"""Good Cloud / Bad Cloud / Judge roles and multi-strategy support (paper-only)."""

from copy import deepcopy

import pytest

from atlas.debate_x import (
    APPROVED_STRATEGIES,
    BAD_CLOUD,
    FLAGSHIP_STRATEGY_ID,
    GOOD_CLOUD,
    JUDGE,
    canonical_role,
    is_approved_strategy,
)
from atlas.debate_x.engine import DebateEngine
from atlas.debate_x.evidence import EvidenceError
from atlas.debate_x.roles import roles_match_order
from atlas.debate_x.shadow import PairedPaperReplay
from atlas.risk.gate import RiskGate, RiskLimits

from .test_debate_x import DeterministicModel, packet, settlement


def test_canonical_roles_and_legacy_aliases():
    assert (GOOD_CLOUD, BAD_CLOUD, JUDGE) == ("good_cloud", "bad_cloud", "judge")
    assert canonical_role("bull") == GOOD_CLOUD
    assert canonical_role("bear") == BAD_CLOUD
    assert canonical_role("judge") == JUDGE
    for bad in ("", "trader", None, 7, ["bull"]):
        assert canonical_role(bad) is None


def test_role_order_must_be_exact():
    def agent(role):
        return {"role": role}

    assert roles_match_order([agent("good_cloud"), agent("bad_cloud"), agent("judge")])
    # Stored pre-rename reviews stay readable.
    assert roles_match_order([agent("bull"), agent("bear"), agent("judge")])
    assert not roles_match_order([agent("bad_cloud"), agent("good_cloud"), agent("judge")])
    assert not roles_match_order([agent("good_cloud"), agent("bad_cloud")])
    assert not roles_match_order([agent("good_cloud"), agent("good_cloud"), agent("judge")])
    assert not roles_match_order("not a list")


def test_prompts_name_the_new_roles_not_the_old_ones():
    model = DeterministicModel()
    DebateEngine(model).run(packet())
    prompts = {role: instructions for role, instructions, _ in model.calls}
    assert "Good Cloud" in prompts[GOOD_CLOUD] and "role='good_cloud'" in prompts[GOOD_CLOUD]
    assert "Bad Cloud" in prompts[BAD_CLOUD] and "role='bad_cloud'" in prompts[BAD_CLOUD]
    assert "do not replace the strategy" in prompts[JUDGE]
    assert "No agent can override the deterministic Atlas risk gate" in prompts[JUDGE]


def test_good_and_bad_cloud_never_see_each_others_output():
    model = DeterministicModel()
    DebateEngine(model).run(packet())
    by_role = {role: evidence for role, _, evidence in model.calls}
    assert GOOD_CLOUD not in by_role[GOOD_CLOUD] and BAD_CLOUD not in by_role[GOOD_CLOUD]
    assert GOOD_CLOUD not in by_role[BAD_CLOUD] and BAD_CLOUD not in by_role[BAD_CLOUD]
    # Only the Judge receives both arguments.
    assert GOOD_CLOUD in by_role[JUDGE] and BAD_CLOUD in by_role[JUDGE]


def test_wrong_role_or_stance_fails_closed():
    result = DebateEngine(DeterministicModel(broken=GOOD_CLOUD)).run(packet())
    assert result["status"] == "AGENT_ERROR"
    assert result["decision"] == "SKIP" and result["shadow_action"] == "NO_ORDER"


def test_approved_strategy_registry_keeps_flagship_and_all_five_others():
    assert FLAGSHIP_STRATEGY_ID in APPROVED_STRATEGIES
    assert set(APPROVED_STRATEGIES) == {
        "scalpstorm_x_0940",
        "sma_9_21",
        "ema_12_26",
        "rsi_14",
        "breakout_20",
        "sps_pullback",
    }
    assert is_approved_strategy("rsi_14") and not is_approved_strategy("made_up")
    assert not is_approved_strategy(None)


@pytest.mark.parametrize("strategy_id", sorted(APPROVED_STRATEGIES))
def test_every_approved_strategy_is_reviewable_without_changing_it(strategy_id):
    raw = deepcopy(packet(identity="s-" + strategy_id))
    raw["strategy_id"] = strategy_id
    result = DebateEngine(DeterministicModel()).run(raw)
    assert result["status"] == "REVIEWED"
    assert result["strategy_id"] == strategy_id
    assert [a["role"] for a in result["agents"]] == [GOOD_CLOUD, BAD_CLOUD, JUDGE]
    assert result["live_orders_enabled"] is False and result["real_orders_placed"] == 0


@pytest.mark.parametrize("strategy_id", sorted(APPROVED_STRATEGIES))
def test_judge_cannot_override_risk_gate_for_any_strategy(strategy_id):
    raw = deepcopy(packet(identity="r-" + strategy_id))
    raw["strategy_id"] = strategy_id
    strict = RiskGate(RiskLimits(max_positions=0))  # deterministic veto: no position allowed
    result = DebateEngine(DeterministicModel(judge="APPROVE"), risk=strict).run(raw)
    assert result["judge_stance"] == "APPROVE"
    assert result["risk_approved"] is False
    assert result["decision"] == "SKIP" and result["shadow_action"] == "NO_ORDER"


def test_legacy_bull_bear_review_still_replays_but_cannot_forge_roles():
    raw = packet(identity="legacy")
    review = DebateEngine(DeterministicModel(judge="REJECT")).run(raw)

    legacy = deepcopy(review)
    legacy["agents"][0]["role"], legacy["agents"][1]["role"] = "bull", "bear"
    row = PairedPaperReplay().settle(raw, legacy, settlement("legacy"))
    assert row["candidate_id"] == "legacy"

    forged = deepcopy(review)
    forged["agents"][0]["role"] = "judge"
    with pytest.raises(EvidenceError, match="Good Cloud/Bad Cloud/Judge"):
        PairedPaperReplay().settle(raw, forged, settlement("legacy"))
