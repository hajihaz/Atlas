"""Snapshot manifests and provenance stamping."""

from __future__ import annotations

import datetime as dt
import unittest

from atlas.common.errors import ReproducibilityError
from atlas.common.time_utils import UTC
from atlas.data.lineage import stamp
from atlas.data.snapshots import build_manifest, verify_manifest


def _rows() -> list[dict[str, object]]:
    return [
        {"instrument_id": "A", "event_date": "2024-03-15", "close": "100"},
        {"instrument_id": "B", "event_date": "2024-03-15", "close": "200"},
    ]


class TestSnapshots(unittest.TestCase):
    def test_build_and_verify_roundtrip(self) -> None:
        m = build_manifest(as_of=dt.datetime(2024, 3, 16, tzinfo=UTC),
                           universe_spec={"index": "NIFTY_50"}, rows=_rows(), sources=["v1"])
        verify_manifest(m, _rows())  # same content reproduces
        self.assertEqual(m.row_count, 2)

    def test_id_is_content_addressed_and_stable(self) -> None:
        kw = dict(as_of=dt.datetime(2024, 3, 16, tzinfo=UTC),
                  universe_spec={"index": "NIFTY_50"}, sources=["v1"])
        a = build_manifest(rows=_rows(), **kw)  # type: ignore[arg-type]
        b = build_manifest(rows=list(reversed(_rows())), **kw)  # order-independent
        self.assertEqual(a.snapshot_id, b.snapshot_id)

    def test_tampered_rows_fail_verification(self) -> None:
        m = build_manifest(as_of=dt.datetime(2024, 3, 16, tzinfo=UTC),
                           universe_spec={}, rows=_rows(), sources=["v1"])
        tampered = _rows()
        tampered[0]["close"] = "999"
        with self.assertRaises(ReproducibilityError):
            verify_manifest(m, tampered)


class TestProvenance(unittest.TestCase):
    def test_stamp_rejects_naive(self) -> None:
        with self.assertRaises(Exception):
            stamp(source="v", collected_at=dt.datetime(2024, 3, 16), ingestion_run_id="r")

    def test_stamp_roundtrip(self) -> None:
        p = stamp(source="v", collected_at=dt.datetime(2024, 3, 16, tzinfo=UTC),
                  ingestion_run_id="r", code_version="abc123")
        self.assertEqual(p.to_dict()["source"], "v")
        self.assertEqual(p.to_dict()["code_version"], "abc123")


if __name__ == "__main__":
    unittest.main()
