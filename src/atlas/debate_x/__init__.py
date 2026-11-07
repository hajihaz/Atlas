"""Atlas Debate X: point-in-time, opt-in, paper-only research.

No broker adapters, real-order capability, or modification of Atlas's existing strategy decisions.
"""

from .costs import IndiaCostModel
from .engine import DebateEngine, DebateModel, evaluate_candidate
from .evidence import Candidate, EvidenceError
from .shadow import ClosedObservation, PairedPaperReplay
from .three_way import ThreeWayChallenge

__all__ = [
    "Candidate",
    "ClosedObservation",
    "DebateEngine",
    "DebateModel",
    "EvidenceError",
    "IndiaCostModel",
    "PairedPaperReplay",
    "ThreeWayChallenge",
    "evaluate_candidate",
]
