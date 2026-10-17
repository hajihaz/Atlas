"""Corporate actions and back-adjustment factors.

Atlas stores **raw, unadjusted** prices as the immutable source of truth and computes
adjusted prices *on read* from the set of corporate actions **known as-of** the query's
knowledge time. This is essential for reproducibility: adjustment factors change as new
actions are announced, so an adjusted series is only well-defined relative to a knowledge
time. Storing adjusted prices as overwrites would silently restate history (F-B1) — Atlas
never does that.

Convention: a corporate action with ex-date ``E`` adjusts every price with event date
``< E``. To adjust a bar on date ``D`` onto a later basis, multiply by the product of the
price factors of all actions with ``ex_date > D`` (that were known as-of the query).
"""

from __future__ import annotations

import datetime as _dt
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation

from atlas.common.types import CorporateActionType

_ONE = Decimal(1)


@dataclass(frozen=True)
class CorporateAction:
    """One corporate action. ``terms`` holds ratios/amounts as strings (never floats).

    Examples:
      * 1→5 split:   ``type=SPLIT``,   ``terms={"old": "1", "new": "5"}``
      * 1:1 bonus:   ``type=BONUS``,   ``terms={"held": "1", "bonus": "1"}``
      * ₹5 dividend: ``type=DIVIDEND``,``terms={"amount": "5.00"}`` (needs ref close)
    """

    instrument_id: str
    ca_type: CorporateActionType
    ex_date: _dt.date
    terms: Mapping[str, str] = field(default_factory=dict)

    def key(self) -> str:
        return f"ca:{self.instrument_id}:{self.ex_date.isoformat()}:{self.ca_type.value}"


#: Corporate actions that scale historical prices (and therefore must be handled here).
_PRICE_AFFECTING = frozenset(
    {
        CorporateActionType.SPLIT,
        CorporateActionType.BONUS,
        CorporateActionType.DIVIDEND,
        CorporateActionType.RIGHTS,
    }
)


def is_price_affecting(ca_type: CorporateActionType) -> bool:
    """Whether an action scales historical prices (used by the price-jump 'explained' check)."""
    return ca_type in _PRICE_AFFECTING


def _validated_term(terms: Mapping[str, str], key: str, *, allow_zero: bool = False) -> Decimal:
    try:
        value = Decimal(terms[key])
    except (KeyError, InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError(f"invalid corporate action term: {key}") from exc
    if not value.is_finite() or value < 0 or (not allow_zero and value == 0):
        raise ValueError(f"corporate action term must be finite and positive: {key}")
    return value


def price_factor(ca: CorporateAction, ref_close: Decimal | None = None) -> Decimal:
    """Multiplicative factor applied to prices *before* ``ca.ex_date``.

    Splits and bonuses are ratio-only (deterministic, no reference price). Dividends need
    ``ref_close`` = the **raw, unadjusted, as-traded close of the session before ex-date**,
    sourced as-of the query's knowledge time (the caller must supply exactly that basis —
    a later-revised or adjusted close would reintroduce look-ahead). Non-price actions
    (symbol/ISIN change, merger, demerger, delisting, face-value change) return 1.

    RIGHTS is price-affecting but its factor is **not yet implemented**, so it fails closed
    (raises) rather than silently returning 1 and corrupting the series — see ADR 0011
    backlog. Full ex-rights math (subscription price + ratio from ``terms``) lands with a
    later ADR.
    """
    t = ca.terms
    if ca.ca_type is CorporateActionType.SPLIT:
        return _validated_term(t, "old") / _validated_term(t, "new")
    if ca.ca_type is CorporateActionType.BONUS:
        held, bonus = _validated_term(t, "held"), _validated_term(t, "bonus", allow_zero=True)
        return held / (held + bonus)
    if ca.ca_type is CorporateActionType.DIVIDEND:
        if ref_close is None or not ref_close.is_finite() or ref_close <= 0:
            raise ValueError("dividend adjustment requires a finite positive reference close")
        amount = _validated_term(t, "amount", allow_zero=True)
        if amount >= ref_close:
            raise ValueError("dividend adjustment must preserve positive historical prices")
        return (ref_close - amount) / ref_close
    if ca.ca_type is CorporateActionType.RIGHTS:
        raise NotImplementedError(
            "rights-issue price adjustment is not yet implemented; it fails closed rather "
            "than silently returning a no-op factor (would corrupt the adjusted series)"
        )
    # Non-price actions: no price scaling.
    return _ONE


def cumulative_price_factor(
    actions: Iterable[CorporateAction],
    bar_date: _dt.date,
    *,
    ref_closes: Mapping[str, Decimal] | None = None,
) -> Decimal:
    """Product of price factors for all actions with ``ex_date > bar_date``.

    Callers pass only the actions **known as-of** the query's knowledge time — that
    bitemporal filtering is what preserves reproducibility. ``ref_closes`` maps a corporate
    action ``key()`` to its reference close (needed only for dividends).
    """
    factor = _ONE
    refs = ref_closes or {}
    ordered = sorted(actions, key=lambda a: a.ex_date)
    if len({ca.key() for ca in ordered}) != len(ordered):
        raise ValueError("duplicate corporate action identity; adjustment blocked")
    if len({ca.instrument_id for ca in ordered}) > 1:
        raise ValueError("mixed-instrument corporate action adjustment blocked")
    for ca in ordered:
        if ca.ex_date > bar_date:
            factor *= price_factor(ca, refs.get(ca.key()))
    return factor
