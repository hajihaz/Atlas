"""Reproducibility & vendor-swap: the Phase-2 exit criteria, as executable tests.

* A vendor can be swapped behind the abstraction with no downstream change.
* An as-of materialization reproduces bit-for-bit (by content digest).
"""

from __future__ import annotations

import datetime as dt
import unittest

from atlas.common.time_utils import UTC
from atlas.data.ingestion import FetchRequest, ingest
from atlas.data.ingestion.adapters import MockCsvAdapter, MockJsonAdapter
from atlas.data.quality import default_suite
from atlas.data.snapshots import build_manifest, verify_manifest

_MAP = {"INFY": "inst_infy"}
_REQ = FetchRequest(("INFY",), dt.date(2024, 3, 14), dt.date(2024, 3, 15))
_KT = dt.datetime(2024, 3, 18, 10, 0, tzinfo=UTC)


class TestVendorSwapEquivalence(unittest.TestCase):
    """Two vendors with *different native formats* must yield identical downstream data."""

    def _csv(self) -> MockCsvAdapter:
        return MockCsvAdapter(
            {"INFY": ["2024-03-14,100,110,90,105,1000", "2024-03-15,105,112,101,108,1200"]}, _MAP
        )

    def _json(self) -> MockJsonAdapter:
        return MockJsonAdapter(
            {
                "INFY": [
                    {"d": "2024-03-14", "o": "100", "h": "110", "l": "90", "c": "105", "vol": 1000},
                    {"d": "2024-03-15", "o": "105", "h": "112", "l": "101", "c": "108", "vol": 1200},
                ]
            },
            _MAP,
        )

    def test_normalized_bars_are_identical(self) -> None:
        csv_bars = [b.to_payload() for b in self._csv().fetch(_REQ)]
        json_bars = [b.to_payload() for b in self._json().fetch(_REQ)]
        self.assertEqual(csv_bars, json_bars)

    def test_loadset_keys_and_payloads_source_independent(self) -> None:
        a = ingest(self._csv(), _REQ, knowledge_time=_KT, suite=default_suite())
        b = ingest(self._json(), _REQ, knowledge_time=_KT, suite=default_suite())
        self.assertEqual([v.key for v in a.load_set], [v.key for v in b.load_set])
        self.assertEqual([dict(v.payload) for v in a.load_set],
                         [dict(v.payload) for v in b.load_set])
        # Only the recorded source differs — that is the *only* trace of which vendor.
        self.assertNotEqual(a.provenance.source, b.provenance.source)


class TestSnapshotReproducibility(unittest.TestCase):
    def test_rematerialization_reproduces_digest(self) -> None:
        rows = [{"instrument_id": "A", "event_date": "2024-03-15", "close": "100"}]
        m = build_manifest(as_of=_KT, universe_spec={"index": "NIFTY_50"}, rows=rows, sources=["v1"])
        # Later, re-materialize the "same" data (possibly in a different row order).
        rematerialized = list(rows)
        verify_manifest(m, rematerialized)  # must not raise


if __name__ == "__main__":
    unittest.main()
