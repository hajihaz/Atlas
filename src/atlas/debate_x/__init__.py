"""Atlas Debate X: point-in-time, opt-in, paper-only research.

No broker adapters, real-order capability, or modification of Atlas's existing strategy decisions.
Good Cloud (supporting), Bad Cloud (challenging) and an independent Judge review candidates from
any approved Atlas strategy; the deterministic RiskGate keeps the only approval authority.
"""

from .costs import IndiaCostModel
from .engine import DebateEngine, DebateModel, evaluate_candidate
from .evidence import Candidate, EvidenceError
from .roles import BAD_CLOUD, GOOD_CLOUD, JUDGE, canonical_role
from .shadow import ClosedObservation, PairedPaperReplay
from .strategies import APPROVED_STRATEGIES, FLAGSHIP_STRATEGY_ID, is_approved_strategy
from .three_way import ThreeWayChallenge

__all__ = [
    "APPROVED_STRATEGIES",
    "BAD_CLOUD",
    "FLAGSHIP_STRATEGY_ID",
    "GOOD_CLOUD",
    "JUDGE",
    "Candidate",
    "ClosedObservation",
    "DebateEngine",
    "DebateModel",
    "EvidenceError",
    "IndiaCostModel",
    "PairedPaperReplay",
    "ThreeWayChallenge",
    "canonical_role",
    "evaluate_candidate",
    "is_approved_strategy",
]
