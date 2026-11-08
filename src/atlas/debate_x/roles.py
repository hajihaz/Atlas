"""Debate X role vocabulary.

Good Cloud argues FOR a strategy's paper candidate (bullish / supporting).
Bad Cloud argues AGAINST it (bearish / challenging).
Judge is an independent evaluation layer. All three are advisory; the deterministic
RiskGate remains the only authority that can approve a paper candidate.

Earlier stored reviews used the role IDs "bull" and "bear". They remain readable
through ``canonical_role`` so existing evidence is preserved, but new reviews are
always written with the canonical IDs below.
"""

from __future__ import annotations

GOOD_CLOUD = "good_cloud"
BAD_CLOUD = "bad_cloud"
JUDGE = "judge"

ROLE_ORDER: tuple[str, str, str] = (GOOD_CLOUD, BAD_CLOUD, JUDGE)

LEGACY_ROLE_ALIASES: dict[str, str] = {"bull": GOOD_CLOUD, "bear": BAD_CLOUD}

DISPLAY_NAMES: dict[str, str] = {
    GOOD_CLOUD: "Good Cloud",
    BAD_CLOUD: "Bad Cloud",
    JUDGE: "Judge",
}

REQUIRED_STANCE: dict[str, frozenset[str]] = {
    GOOD_CLOUD: frozenset({"SUPPORT"}),
    BAD_CLOUD: frozenset({"OPPOSE"}),
    JUDGE: frozenset({"APPROVE", "REJECT", "REVIEW"}),
}


def canonical_role(role: object) -> str | None:
    """Return the canonical role ID, mapping legacy bull/bear IDs; None if unknown."""
    if not isinstance(role, str):
        return None
    mapped = LEGACY_ROLE_ALIASES.get(role, role)
    return mapped if mapped in ROLE_ORDER else None


def roles_match_order(agents: object) -> bool:
    """True when ``agents`` is exactly [Good Cloud, Bad Cloud, Judge] in order."""
    if not isinstance(agents, list) or len(agents) != len(ROLE_ORDER):
        return False
    found = [canonical_role(a.get("role")) if isinstance(a, dict) else None for a in agents]
    return tuple(found) == ROLE_ORDER
