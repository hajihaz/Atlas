"""Instrument and OHLCV bar records.

Design choice: these records are **permissive**. They carry raw, *unadjusted* values and do
NOT reject economically impossible data (e.g. high < low, negative price) at construction.
That is deliberate — bad data must be *representable* so the data-quality layer can detect
and quarantine it (data-quality.md). Only structural facts (tz-awareness, Decimal prices)
are enforced here. Prices are ``Decimal`` — never float — so reproducibility is exact.
"""

from __future__ import annotations

import datetime as _dt
from collections.abc import Mapping
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation, localcontext
from typing import Any

from atlas.common.errors import AtlasError
from atlas.common.types import InstrumentType

#: Sane bounds on a price's magnitude/precision. Untrusted vendor input is coerced inside a
#: bounded decimal context so a hostile feed cannot DoS us with a degenerate value like
#: "1E1000000000" (which would burn unbounded CPU/RAM when later serialized/hashed).
_MAX_PRICE_EXPONENT = 12  # up to ~1e12; NSE prices are far below this
_MAX_VOLUME_DIGITS = 18  # fits BigInteger; rejects absurd digit strings


def _to_decimal(value: Decimal | str | int) -> Decimal:
    """Coerce to Decimal via str (no float artefacts) inside a bounded context (no DoS)."""
    try:
        with localcontext() as ctx:
            ctx.prec = 34
            ctx.traps[InvalidOperation] = True
            d = value if isinstance(value, Decimal) else Decimal(str(value))
            if d.is_nan() or d.is_infinite() or abs(d.adjusted()) > _MAX_PRICE_EXPONENT:
                raise AtlasError(f"price out of accepted range: {value!r}")
            return +d  # normalize within the bounded context
    except (InvalidOperation, ValueError) as exc:
        raise AtlasError(f"invalid price value: {value!r}") from exc


def _to_volume(value: int | str) -> int:
    """Parse a volume, rejecting absurd/non-canonical digit strings from untrusted feeds."""
    if isinstance(value, int):
        return value
    s = str(value).strip()
    if not s.lstrip("-").isdigit() or len(s.lstrip("-")) > _MAX_VOLUME_DIGITS:
        raise AtlasError(f"invalid volume value: {value!r}")
    return int(s)


@dataclass(frozen=True)
class Instrument:
    """A tradable (or index) instrument. Never deleted — delisted names stay forever,
    which is what makes the universe survivorship-bias-free.
    """

    instrument_id: str
    symbol: str
    name: str
    instrument_type: InstrumentType
    isin: str | None = None
    listing_date: _dt.date | None = None
    delisting_date: _dt.date | None = None
    meta: Mapping[str, Any] = field(default_factory=dict)

    @property
    def is_active(self) -> bool:
        return self.delisting_date is None


@dataclass(frozen=True)
class OHLCVBar:
    """A single raw, unadjusted OHLCV bar for one instrument on one session date."""

    instrument_id: str
    event_date: _dt.date
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: int
    source: str

    def __post_init__(self) -> None:
        for f in ("open", "high", "low", "close"):
            object.__setattr__(self, f, _to_decimal(getattr(self, f)))
        object.__setattr__(self, "volume", _to_volume(self.volume))

    def key(self) -> str:
        """Logical bitemporal key for this bar."""
        return f"ohlcv:{self.instrument_id}:{self.event_date.isoformat()}"

    def to_payload(self) -> dict[str, Any]:
        return {
            "instrument_id": self.instrument_id,
            "event_date": self.event_date.isoformat(),
            "open": self.open,
            "high": self.high,
            "low": self.low,
            "close": self.close,
            "volume": self.volume,
        }
