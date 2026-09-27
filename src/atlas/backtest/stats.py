"""Low-level statistics — pure stdlib, shared by metrics and overfitting.

Kept dependency-free (``math`` + ``statistics``) so the whole evidence path is deterministic
and testable on a bare Python (ADR 0015).
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from statistics import fmean


def mean(xs: Sequence[float]) -> float:
    return fmean(xs) if xs else 0.0


def stdev(xs: Sequence[float]) -> float:
    """Sample standard deviation (n-1). Returns 0 for fewer than two points."""
    n = len(xs)
    if n < 2:
        return 0.0
    m = fmean(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / (n - 1))


def _std_moment(xs: Sequence[float], k: int) -> float:
    n = len(xs)
    if n < 2:
        return 0.0
    m = fmean(xs)
    s = math.sqrt(sum((x - m) ** 2 for x in xs) / n)  # population sd for standardized moments
    if s == 0:
        return 0.0
    return sum(((x - m) / s) ** k for x in xs) / n


def skewness(xs: Sequence[float]) -> float:
    """Standardized third moment (0 for a symmetric distribution)."""
    return _std_moment(xs, 3)


def kurtosis(xs: Sequence[float]) -> float:
    """Standardized fourth moment, **non-excess** (3.0 for a normal distribution)."""
    return _std_moment(xs, 4)


def quantile(xs: Sequence[float], q: float) -> float:
    """Linear-interpolation quantile of *xs* at ``q`` in [0, 1]."""
    if not xs:
        return 0.0
    ys = sorted(xs)
    if len(ys) == 1:
        return ys[0]
    pos = q * (len(ys) - 1)
    lo = math.floor(pos)
    hi = min(lo + 1, len(ys) - 1)
    frac = pos - lo
    return ys[lo] * (1 - frac) + ys[hi] * frac
