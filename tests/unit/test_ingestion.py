"""Ingestion pipeline: fail-safe, idempotent, provenance-stamped."""

from __future__ import annotations

import datetime as dt
import unittest

from atlas.common.errors import DataQualityHalt
from atlas.common.time_utils import UTC
from atlas.data.ingestion import FetchRequest, ingest
from atlas.data.ingestion.adapters import MockCsvAdapter
from atlas.data.quality import default_suite

_KT = dt.datetime(2024, 3, 18, 10, 0, tzinfo=UTC)  # a Monday, after the session dates
_REQ = FetchRequest(symbols=("INFY",), start=dt.date(2024, 3, 14), end=dt.date(2024, 3, 15))
_MAP = {"INFY": "inst_infy"}


def _csv(rows: list[str]) -> MockCsvAdapter:
    return MockCsvAdapter({"INFY": rows}, _MAP)


class TestIngestion(unittest.TestCase):
    def test_clean_ingest_produces_loadset(self) -> None:
        adapter = _csv(["2024-03-14,100,110,90,105,1000", "2024-03-15,105,112,101,108,1200"])
        result = ingest(adapter, _REQ, knowledge_time=_KT, suite=default_suite())
        self.assertFalse(result.halted)
        self.assertEqual(len(result.load_set), 2)
        self.assertEqual(result.provenance.source, "mock_csv")
        # Every loaded version's knowledge_from is the ingestion knowledge time.
        self.assertTrue(all(v.knowledge_from == _KT for v in result.load_set))

    def test_bad_data_raises_by_default(self) -> None:
        # high < low -> ERROR -> fail-safe: strict ingest RAISES (cannot be silently ignored).
        adapter = _csv(["2024-03-14,100,80,90,105,1000"])
        with self.assertRaises(DataQualityHalt):
            ingest(adapter, _REQ, knowledge_time=_KT, suite=default_suite())

    def test_bad_data_quarantined_non_strict(self) -> None:
        # strict=False returns a halted result with an empty load-set (nothing loaded).
        adapter = _csv(["2024-03-14,100,80,90,105,1000"])
        result = ingest(adapter, _REQ, knowledge_time=_KT, suite=default_suite(), strict=False)
        self.assertTrue(result.halted)
        self.assertEqual(result.load_set, ())

    def test_idempotent(self) -> None:
        rows = ["2024-03-14,100,110,90,105,1000"]
        a = ingest(_csv(rows), _REQ, knowledge_time=_KT, suite=default_suite())
        b = ingest(_csv(rows), _REQ, knowledge_time=_KT, suite=default_suite())
        self.assertEqual(a.run_id, b.run_id)
        self.assertEqual([v.key for v in a.load_set], [v.key for v in b.load_set])
        self.assertEqual(
            [dict(v.payload) for v in a.load_set], [dict(v.payload) for v in b.load_set]
        )


if __name__ == "__main__":
    unittest.main()
