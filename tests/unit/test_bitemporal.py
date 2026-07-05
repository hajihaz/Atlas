"""Point-in-time correctness — the most important tests in the data layer.

If these pass, Atlas cannot see the future and cannot silently restate the past.
"""

from __future__ import annotations

import datetime as dt
import unittest

from atlas.common.errors import PointInTimeViolation
from atlas.common.time_utils import UTC
from atlas.data.bitemporal import BitemporalStore, BitemporalVersion, resolve_asof


def _t(day: int, hour: int = 10) -> dt.datetime:
    return dt.datetime(2024, 3, day, hour, 0, tzinfo=UTC)


class TestAsOf(unittest.TestCase):
    def test_no_lookahead(self) -> None:
        """A value learned at T is invisible to any query as-of before T."""
        store = BitemporalStore()
        store.record(key="ohlcv:x:2024-03-15", knowledge_time=_t(16), payload={"close": "100"},
                     source="v1")
        # As-of the 15th (before we learned it on the 16th) -> nothing.
        self.assertIsNone(store.as_of("ohlcv:x:2024-03-15", _t(15)))
        # As-of the 16th -> the value.
        got = store.as_of("ohlcv:x:2024-03-15", _t(16))
        assert got is not None
        self.assertEqual(got.payload["close"], "100")

    def test_revision_preserves_history(self) -> None:
        """A correction appends a version; the old value is still what we 'knew then'."""
        store = BitemporalStore()
        store.record(key="k", knowledge_time=_t(16), payload={"close": "100"}, source="v1")
        store.record(key="k", knowledge_time=_t(18), payload={"close": "101"}, source="v1")  # fix
        as_of_17 = store.as_of("k", _t(17))
        as_of_19 = store.as_of("k", _t(19))
        assert as_of_17 is not None and as_of_19 is not None
        self.assertEqual(as_of_17.payload["close"], "100")  # the value known on the 17th
        self.assertEqual(as_of_19.payload["close"], "101")  # the corrected value
        self.assertEqual(as_of_19.revision, 1)
        # The full append-only history retains both versions.
        self.assertEqual(len(store.all_versions("k")), 2)

    def test_current_pointer(self) -> None:
        store = BitemporalStore()
        store.record(key="k", knowledge_time=_t(16), payload={"v": 1}, source="s")
        store.record(key="k", knowledge_time=_t(18), payload={"v": 2}, source="s")
        current = store.current("k")
        assert current is not None
        self.assertEqual(current.payload["v"], 2)
        self.assertTrue(current.is_current)

    def test_overlapping_versions_raise(self) -> None:
        """Disjoint knowledge intervals are an invariant; overlap must be caught, not guessed."""
        a = BitemporalVersion("k", _t(16), _t(20), {"v": 1}, "s")
        b = BitemporalVersion("k", _t(18), _t(22), {"v": 2}, "s")  # overlaps a
        with self.assertRaises(PointInTimeViolation):
            resolve_asof([a, b], _t(19))

    def test_backdated_correction_rejected(self) -> None:
        store = BitemporalStore()
        store.record(key="k", knowledge_time=_t(18), payload={"v": 1}, source="s")
        with self.assertRaises(PointInTimeViolation):
            store.record(key="k", knowledge_time=_t(16), payload={"v": 2}, source="s")

    def test_naive_as_of_rejected(self) -> None:
        store = BitemporalStore()
        store.record(key="k", knowledge_time=_t(16), payload={"v": 1}, source="s")
        with self.assertRaises(PointInTimeViolation):
            store.as_of("k", dt.datetime(2024, 3, 17, 10, 0))  # naive


if __name__ == "__main__":
    unittest.main()
