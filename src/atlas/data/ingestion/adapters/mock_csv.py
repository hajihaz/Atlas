"""A deterministic CSV-shaped vendor adapter (native format: comma-separated strings)."""

from __future__ import annotations

import datetime as _dt
from collections.abc import Mapping, Sequence
from decimal import Decimal

from atlas.data.ingestion.adapter import FetchRequest, VendorAdapter
from atlas.data.market.records import OHLCVBar


class MockCsvAdapter(VendorAdapter):
    """Native shape: ``{symbol: ["YYYY-MM-DD,open,high,low,close,volume", ...]}``.

    Header/units/ordering are this vendor's quirks; :meth:`fetch` normalizes them away.
    """

    name = "mock_csv"

    def __init__(
        self, rows_by_symbol: Mapping[str, Sequence[str]], symbol_to_instrument: Mapping[str, str]
    ) -> None:
        self._rows = rows_by_symbol
        self._symbol_to_instrument = symbol_to_instrument

    def fetch(self, request: FetchRequest) -> list[OHLCVBar]:
        bars: list[OHLCVBar] = []
        for symbol in request.symbols:
            instrument_id = self._symbol_to_instrument[symbol]
            for line in self._rows.get(symbol, ()):
                d, o, h, low, c, v = (part.strip() for part in line.split(","))
                event_date = _dt.date.fromisoformat(d)
                if not (request.start <= event_date <= request.end):
                    continue
                bars.append(
                    OHLCVBar(
                        instrument_id=instrument_id,
                        event_date=event_date,
                        open=Decimal(o),
                        high=Decimal(h),
                        low=Decimal(low),
                        close=Decimal(c),
                        volume=int(v),
                        source=self.name,
                    )
                )
        bars.sort(key=lambda b: (b.instrument_id, b.event_date))
        return bars
