"""Atlas boundary for LEAN simulation integration.

This package contains transport contracts only. It deliberately has no broker,
order-placement, credential, or LEAN runtime dependency.
"""

from atlas.lean.contracts import LeanDecision, LeanDecisionEnvelope

__all__ = ["LeanDecision", "LeanDecisionEnvelope"]
