"""Explicit research-to-paper promotion gates; no live capability."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

from atlas.research.gates import GateVerdict


@dataclass(frozen=True)
class PaperEvidence:
    """Evidence collected after a validated research result is run in paper mode."""

    sessions: int
    result_hash: str
    ledger_hash: str
    reconciled: bool
    risk_rejections: int = 0
    runtime_errors: int = 0
    market_source_type: str = "deterministic_fixture"
    market_session_provenance_hash: str = ""


@dataclass(frozen=True)
class PromotionVerdict:
    passed: bool
    checks: Mapping[str, bool]
    reasons: tuple[str, ...] = ()


def evaluate_paper_promotion(
    research_verdict: GateVerdict,
    evidence: PaperEvidence,
    *,
    min_sessions: int = 30,
) -> PromotionVerdict:
    """Require research validation plus clean, reconciled paper evidence."""
    checks = {
        "research_validated": research_verdict.passed,
        "paper_sample_size": evidence.sessions >= min_sessions,
        "result_hash_present": bool(evidence.result_hash),
        "ledger_hash_present": bool(evidence.ledger_hash),
        "reconciled": evidence.reconciled,
        "no_runtime_errors": evidence.runtime_errors == 0,
        "no_risk_rejections": evidence.risk_rejections == 0,
        "recorded_external_market_paper": (
            evidence.market_source_type == "recorded_external_paper"
            and bool(evidence.market_session_provenance_hash)
        ),
    }
    reasons: list[str] = []
    if not checks["research_validated"]:
        reasons.append("research evidence gates did not pass")
    if not checks["paper_sample_size"]:
        reasons.append(f"paper sessions {evidence.sessions} < {min_sessions}")
    if not checks["result_hash_present"]:
        reasons.append("paper evidence has no research result hash")
    if not checks["ledger_hash_present"]:
        reasons.append("paper evidence has no ledger checkpoint")
    if not checks["reconciled"]:
        reasons.append("paper account is not reconciled")
    if not checks["no_runtime_errors"]:
        reasons.append("paper runtime reported errors")
    if not checks["no_risk_rejections"]:
        reasons.append("paper evidence contains risk rejections")
    if not checks["recorded_external_market_paper"]:
        reasons.append("paper promotion requires recorded external-market session provenance")
    return PromotionVerdict(all(checks.values()), checks, tuple(reasons))
