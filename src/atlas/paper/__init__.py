"""Paper-trading boundary: synthetic execution only."""

from .broker_simulator import DeterministicPaperBroker
from .cycle import PaperCycle, PaperCycleResult
from .runtime import PaperConfig, PaperRuntime, PaperSnapshot
from .session import PaperSessionRunner, SessionResult
from .validation import MultiSessionEvidence, SessionObservation, run_sessions

__all__ = [
    "DeterministicPaperBroker",
    "MultiSessionEvidence",
    "PaperConfig",
    "PaperCycle",
    "PaperCycleResult",
    "PaperRuntime",
    "PaperSessionRunner",
    "PaperSnapshot",
    "SessionObservation",
    "SessionResult",
    "run_sessions",
]
