"""Three-way Debate X cash-only simulator: realistic costs, resume, fail-closed data."""

from __future__ import annotations

import datetime as dt
import json
import sqlite3
from decimal import Decimal
from pathlib import Path

import pytest

from atlas.debate_x.cli import run_threeway_casefile
from atlas.debate_x.costs import IndiaCostModel
from atlas.debate_x.engine import DebateEngine
from atlas.debate_x.evidence import Candidate, EvidenceError
from atlas.debate_x.three_way import ThreeWayChallenge, rule_decision

IST = dt.timezone(dt.timedelta(hours=5, minutes=30))


def at(day: dt.date, hour: int, minute: int, second: int = 0) -> str:
    return dt.datetime(day.year, day.month, day.day, hour, minute, second, tzinfo=IST).isoformat()


def trial(
    day: dt.date = dt.date(2026, 11, 5), ident: str = "c1", *, exit_price: str = "520"
) -> dict:
    signal, prev = at(day, 9, 40), at(day, 9, 39, 30)
    return {
        "candidate": {
            "schema": 1,
            "mode": "POINT_IN_TIME_PAPER_REPLAY",
            "live_orders_enabled": False,
            "id": ident,
            "snapshot_id": "snap-" + ident,
            "strategy_id": "ScalpStorm-X",
            "symbol": "TESTNSE",
            "decision_at": signal,
            "entry_price_inr": "500",
            "baseline_intent": "BUY",
            "quote_evidence_id": "q1",
            "evidence": [
                {
                    "id": "q1",
                    "kind": "quote",
                    "source": "private-authorized-snapshot",
                    "published_at": prev,
                    "received_at": prev,
                    "price_inr": "500",
                    "detail": "Candidate timestamped quote",
                },
                {
                    "id": "v1",
                    "kind": "volume",
                    "source": "private-authorized-volume",
                    "published_at": prev,
                    "received_at": prev,
                    "detail": "Verified volume signal",
                },
            ],
            "indicators": {
                "source": "authorized-closed-indicators",
                "as_of": prev,
                "received_at": prev,
                "sma9": "505",
                "sma21": "499",
                "vwap": "497",
                "rsi14": "61",
                "volume_ratio": "1.5",
                "momentum_30m_pct": "0.4",
            },
        },
        "execution": {
            "decision_completed_at": at(day, 9, 40, 12),
            "entry_quote": {
                "market": "NSE",
                "source": "private-authorized-quote",
                "observed_at": at(day, 9, 40, 22),
                "received_at": at(day, 9, 40, 24),
                "price_inr": "501",
                "bar_volume": "100000",
            },
            "exit_quote": {
                "market": "NSE",
                "source": "private-authorized-quote",
                "observed_at": at(day, 15, 14, 57),
                "received_at": at(day, 15, 15),
                "price_inr": exit_price,
                "bar_volume": "105000",
            },
        },
    }


class Model:
    def __init__(self, stance: str = "APPROVE"):
        self.stance = stance
        self.calls: list[tuple[str, str]] = []

    def complete(self, *, role: str, instructions: str, evidence_json: str) -> str:
        self.calls.append((role, evidence_json))
        return json.dumps(
            {
                "role": role,
                "stance": {
                    "good_cloud": "SUPPORT",
                    "bad_cloud": "OPPOSE",
                    "judge": self.stance,
                }[role],
                "reason": "Test fixture only",
                "evidence_ids": ["q1", "v1"],
                "risks": [],
            }
        )


def verdict(candidate: dict, stance: str = "APPROVE") -> dict:
    return DebateEngine(Model(stance)).run(candidate)


def test_three_books_trade_with_realistic_costs_and_equal_source(tmp_path: Path):
    t = trial()
    with ThreeWayChallenge(tmp_path / "paper.sqlite3") as challenge:
        row = challenge.process(t["candidate"], verdict(t["candidate"]), t["execution"])
        assert row["baseline_shares"] == row["rules_shares"] == row["filtered_shares"] > 0
        assert Decimal(row["baseline_pnl_inr"]) > 0
        assert Decimal(row["baseline_charges_inr"]) > 0
        assert row["entry_quote_inr"] == "501"  # re-quoted AFTER the decision
        assert row["exit_quote_inr"] == "520"
        assert Decimal(row["baseline_equity_inr"]) > Decimal("100000")
        report = challenge.report()
        assert report["comparison_valid"] is False  # no 15 completed sessions yet
        assert report["sessions_completed"] == 0
        assert report["trade_count"] == 1
        assert report["portfolio_stats"]["baseline"]["trades"] == 1
        assert report["portfolio_stats"]["baseline"]["wins"] == 1
        assert report["portfolio_stats"]["baseline"]["win_rate_pct"] == "100.00"
        assert report["certified_forward"] is False
        assert report["real_orders_placed"] == 0
        assert report["equity_curve"][0]["rules_inr"] == "100000"
        challenge.end_session("2026-11-05")
        assert challenge.report()["sessions_completed"] == 1


def test_fills_worse_than_quote_and_charges_both_sides():
    costs = IndiaCostModel()
    buy = costs.fill_price(Decimal("500"), "BUY", 19, Decimal("10000"))
    sell = costs.fill_price(Decimal("500"), "SELL", 19, Decimal("10000"))
    assert buy >= Decimal("500.05")
    assert sell < Decimal("500")
    result = costs.simulate(
        Decimal("10000"), Decimal("500"), Decimal("500"), Decimal("100000"), Decimal("110000")
    )
    assert result["shares"] > 0
    assert Decimal(str(result["pnl_inr"])) < 0
    assert Decimal(str(result["charges_inr"])) > 0


def test_rules_use_only_timestamped_indicator_fields():
    t = trial()
    c = Candidate.parse(t["candidate"])
    assert rule_decision(t["candidate"], c) == (True, "RULES_PASS")
    t["candidate"]["indicators"]["received_at"] = at(dt.date(2026, 11, 5), 9, 38)
    assert rule_decision(t["candidate"], c) == (False, "STALE_INDICATORS")
    t["candidate"].pop("indicators")
    assert rule_decision(t["candidate"], c) == (False, "NO_INDICATORS")


def test_rejected_ai_not_mislabeled_as_rules_based_agent(tmp_path: Path):
    t = trial()
    t["candidate"]["indicators"]["sma9"] = "100"
    with ThreeWayChallenge(tmp_path / "paper.sqlite3") as challenge:
        row = challenge.process(t["candidate"], verdict(t["candidate"], "REJECT"), t["execution"])
        assert row["baseline_shares"] > 0
        assert row["rules_shares"] == row["filtered_shares"] == 0
        assert row["missed_profitable_trade"] is True
        assert row["rules_reason"] == "RULES_REJECT"
        assert challenge.report()["ai_coverage_complete"] is True


def test_missing_llm_stays_unavailable_and_does_not_fake_equity(tmp_path: Path):
    t = trial()
    result = run_threeway_casefile(
        {"cases": [t], "close_sessions": ["2026-11-05"]},
        state=tmp_path / "trial.sqlite3",
    )
    assert result["sessions_completed"] == 1
    assert result["connected_model"] is False
    assert result["comparison_valid"] is False
    assert result["rows"][0]["review_status"] == "NOT_CONNECTED"
    assert result["rows"][0]["filtered_shares"] == 0
    assert result["rows"][0]["rules_shares"] > 0
    assert result["evaluations"][0]["agents"] == []


def test_resume_idempotent_and_mutation_blocked(tmp_path: Path):
    t = trial()
    model = Model()
    state = tmp_path / "persist.sqlite3"
    first = run_threeway_casefile({"cases": [t]}, state=state, model=model)
    assert first["trade_count"] == 1
    assert len(model.calls) == 3
    second = run_threeway_casefile({"cases": [t]}, state=state, model=model)
    assert second["ledger_chain_head"] == first["ledger_chain_head"]
    assert len(model.calls) == 3  # zero new model calls
    t["execution"]["exit_quote"]["price_inr"] = "999"
    with pytest.raises(EvidenceError, match="changed"):
        run_threeway_casefile({"cases": [t]}, state=state, model=model)


def test_post_decision_quote_failures_never_write(tmp_path: Path):
    mutations = [
        ("decision_completed_at", at(dt.date(2026, 11, 5), 9, 39, 59)),
        ("entry_quote.received_at", at(dt.date(2026, 11, 5), 9, 44)),
        ("entry_quote.observed_at", at(dt.date(2026, 11, 5), 9, 40)),
        ("entry_quote.bar_volume", "0"),
        ("entry_quote.source", ""),
        ("exit_quote.observed_at", at(dt.date(2026, 11, 6), 15, 14)),
        ("exit_quote.source", "unrelated provider"),
    ]
    for i, (key, new_value) in enumerate(mutations):
        t = trial()
        if "." in key:
            group, attr = key.split(".")
            t["execution"][group][attr] = new_value
        else:
            t["execution"][key] = new_value
        with ThreeWayChallenge(tmp_path / f"invalid_{i}.sqlite3") as challenge:
            with pytest.raises(EvidenceError):
                challenge.process(t["candidate"], verdict(t["candidate"]), t["execution"])
            assert challenge.report()["trade_count"] == 0


def test_timestamped_exit_never_in_model_prompt(tmp_path: Path):
    t = trial(exit_price="999")
    model = Model()
    report = run_threeway_casefile({"cases": [t]}, state=tmp_path / "plain.sqlite3", model=model)
    assert report["trade_count"] == 1
    assert all("999" not in content for _, content in model.calls)
    assert all("exit_quote" not in content for _, content in model.calls)


def test_challenge_finishes_only_after_fifteen_explicitly_closed_sessions(tmp_path: Path):
    state = tmp_path / "15days.sqlite3"
    model = Model()
    completed = []
    day = dt.date(2026, 11, 2)
    for n in range(15):
        while day.weekday() >= 5:
            day += dt.timedelta(days=1)
        t = trial(day, f"t{n}")
        report = run_threeway_casefile(
            {"cases": [t], "close_sessions": [day.isoformat()]}, state=state, model=model
        )
        completed.append(day)
        day += dt.timedelta(days=1)
    assert len(set(completed)) == 15
    assert report["sessions_completed"] == 15
    assert report["status"] == "COMPLETE"
    assert report["comparison_valid"] is True
    assert report["approved_count"] == 15
    assert report["trade_count"] == 15
    assert len(report["equity_curve"]) == 16
    assert len(model.calls) == 45
    while day.weekday() >= 5:
        day += dt.timedelta(days=1)
    t = trial(day, "outside")
    with pytest.raises(EvidenceError, match="complete"):
        with ThreeWayChallenge(state) as challenge:
            challenge.process(t["candidate"], verdict(t["candidate"]), t["execution"])


def test_holiday_weekend_and_early_close_guard(tmp_path: Path):
    weekend = trial(dt.date(2026, 11, 7), "w")
    with ThreeWayChallenge(tmp_path / "date.sqlite3") as challenge:
        with pytest.raises(EvidenceError, match="eligible"):
            challenge.process(
                weekend["candidate"], verdict(weekend["candidate"]), weekend["execution"]
            )
    holiday = trial()
    with ThreeWayChallenge(
        tmp_path / "holiday.sqlite3", holidays=frozenset({"2026-11-05"})
    ) as challenge:
        with pytest.raises(EvidenceError, match="eligible"):
            challenge.process(
                holiday["candidate"], verdict(holiday["candidate"]), holiday["execution"]
            )


def test_chained_journal_detects_tampering(tmp_path: Path):
    t = trial()
    state = tmp_path / "tamper.sqlite3"
    run_threeway_casefile({"cases": [t]}, state=state, model=Model())
    with sqlite3.connect(state) as db:
        db.execute("UPDATE trades SET body=replace(body, '501', '777')")
    with pytest.raises(EvidenceError, match="chain mismatch"):
        ThreeWayChallenge(state)


def test_resume_rejects_changes_to_cost_model(tmp_path: Path):
    state = tmp_path / "config.sqlite3"
    with ThreeWayChallenge(state):
        pass
    with pytest.raises(EvidenceError, match="configuration mismatch"):
        ThreeWayChallenge(state, charges=IndiaCostModel(spread_bps=Decimal("20")))


def test_session_closure_is_explicit_and_rejects_late_input(tmp_path: Path):
    t = trial()
    state = tmp_path / "closed.sqlite3"
    report = run_threeway_casefile(
        {"cases": [t], "close_sessions": ["2026-11-05"]}, state=state, model=Model()
    )
    assert report["sessions_completed"] == 1
    duplicate = trial(ident="other")
    with ThreeWayChallenge(state) as challenge:
        with pytest.raises(EvidenceError, match="closed"):
            challenge.process(
                duplicate["candidate"], verdict(duplicate["candidate"]), duplicate["execution"]
            )


def test_invalid_quote_blocks_llm_call_before_paid_provider(tmp_path: Path):
    t = trial()
    t["execution"]["entry_quote"]["bar_volume"] = "0"
    model = Model()
    with pytest.raises(EvidenceError, match="positive"):
        run_threeway_casefile({"cases": [t]}, state=tmp_path / "invalid.sqlite3", model=model)
    assert model.calls == []


def test_multiple_sessions_in_one_batch_close_in_order(tmp_path: Path):
    dates = [dt.date(2026, 11, d) for d in (3, 4, 5)]
    cases = [trial(day, f"batch{n}") for n, day in enumerate(dates)]
    model = Model()
    report = run_threeway_casefile(
        {"cases": cases, "close_sessions": [d.isoformat() for d in dates]},
        state=tmp_path / "batch.sqlite3",
        model=model,
    )
    assert report["sessions_completed"] == 3
    assert report["trade_count"] == 3
    assert len(model.calls) == 9
    assert report["session_dates"] == [d.isoformat() for d in dates]


def test_outcomes_do_not_pretend_to_be_authentic_nse_forward_returns(tmp_path: Path):
    report = run_threeway_casefile(
        {"cases": [trial()]}, state=tmp_path / "unverified.sqlite3", model=Model()
    )
    assert report["certified_forward"] is False
    assert "not independently certified" in report["disclaimer"]
    assert report["comparison_valid"] is False
