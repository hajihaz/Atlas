"""Atlas Debate X: point-in-time, opt-in, paper-only research.

No broker adapters, real-order capability, or modification of Atlas's existing strategy decisions.
"""

from .engine import DebateEngine, DebateModel, evaluate_candidate
from .evidence import Candidate, EvidenceError
from .shadow import ClosedObservation, PairedPaperReplay

__all__ = [
    "Candidate",
    "ClosedObservation",
    "DebateEngine",
    "DebateModel",
    "EvidenceError",
    "PairedPaperReplay",
    "evaluate_candidate",
]
