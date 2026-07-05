"""The vendor adapter boundary.

An adapter's one job is to turn a vendor's native, messy shape into canonical
:class:`~atlas.data.market.records.OHLCVBar` records (symbology, units, Decimal coercion).
Because adapters return normalized bars, the pipeline never sees vendor quirks — that
isolation is what makes vendors replaceable over a 10-year horizon (ADR 0002).
"""

from __future__ import annotations

import abc
import datetime as _dt
from dataclasses import dataclass

from atlas.data.market.records import OHLCVBar


@dataclass(frozen=True)
class FetchRequest:
    """What to fetch: instruments over an inclusive session-date range."""

    symbols: tuple[str, ...]
    start: _dt.date
    end: _dt.date


class VendorAdapter(abc.ABC):
    """Abstract market-data vendor. Concrete adapters normalize their own native format."""

    #: Stable source identifier stamped into provenance and bitemporal versions.
    name: str = "vendor"

    @abc.abstractmethod
    def fetch(self, request: FetchRequest) -> list[OHLCVBar]:
        """Return canonical, normalized OHLCV bars for *request*.

        Implementations must be deterministic for a given input (no hidden clock/network
        nondeterminism in the returned values) so ingestion is reproducible.
        """
        raise NotImplementedError
