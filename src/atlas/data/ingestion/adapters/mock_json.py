"""A deterministic JSON-shaped vendor adapter (native format: dicts with terse keys).

Deliberately different field names/shape from :class:`MockCsvAdapter` to demonstrate that
normalization — not the pipeline — absorbs vendor differences. Both adapters emit identical
:class:`OHLCVBar` records for the same logical data.
"""

from __future__ import annotations

import datetime as _dt
from collections.abc import Mapping, Sequence
from decimal import Decimal
from typing import Any

from atlas.data.ingestion.adapter import FetchRequest, VendorAdapter
from atlas.data.market.records import OHLCVBar


class MockJsonAdapter(VendorAdapter):
    """Native shape: ``{symbol: [{"d": "YYYY-MM-DD", "o":..,"h":..,"l":..,"c":..,"vol":..}]}``."""

    name = "mock_json"

    def __init__(
        self,
        records_by_symbol: Mapping[str, Sequence[Mapping[str, Any]]],
        symbol_to_instrument: Mapping[str, str],
    ) -> None:
        self._records = records_by_symbol
        self._symbol_to_instrument = symbol_to_instrument

    def fetch(self, request: FetchRequest) -> list[OHLCVBar]:
        bars: list[OHLCVBar] = []
        for symbol in request.symbols:
            instrument_id = self._symbol_to_instrument[symbol]
            for rec in self._records.get(symbol, ()):
                event_date = _dt.date.fromisoformat(str(rec["d"]))
                if not (request.start <= event_date <= request.end):
                    continue
                bars.append(
                    OHLCVBar(
                        instrument_id=instrument_id,
                        event_date=event_date,
                        open=Decimal(str(rec["o"])),
                        high=Decimal(str(rec["h"])),
                        low=Decimal(str(rec["l"])),
                        close=Decimal(str(rec["c"])),
                        volume=int(rec["vol"]),
                        source=self.name,
                    )
                )
        bars.sort(key=lambda b: (b.instrument_id, b.event_date))
        return bars
