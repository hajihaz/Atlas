"""Time Authority + hashing invariants."""

from __future__ import annotations

import datetime as dt
import unittest
from decimal import Decimal

from atlas.common.errors import PointInTimeViolation
from atlas.common.hashing import GENESIS_HASH, canonical_json, chain_hash, content_hash
from atlas.common.time_utils import IST, UTC, ist_date, require_aware, session_close_utc, to_utc


class TestTimeAuthority(unittest.TestCase):
    def test_require_aware_rejects_naive(self) -> None:
        with self.assertRaises(PointInTimeViolation):
            require_aware(dt.datetime(2024, 3, 15, 10, 0))  # naive

    def test_require_aware_accepts_aware(self) -> None:
        aware = dt.datetime(2024, 3, 15, 10, 0, tzinfo=UTC)
        self.assertIs(require_aware(aware), aware)

    def test_to_utc_normalizes(self) -> None:
        ist_time = dt.datetime(2024, 3, 15, 15, 30, tzinfo=IST)
        self.assertEqual(to_utc(ist_time), dt.datetime(2024, 3, 15, 10, 0, tzinfo=UTC))

    def test_session_close_is_1530_ist(self) -> None:
        close = session_close_utc(dt.date(2024, 3, 15))
        self.assertEqual(close.astimezone(IST).time(), dt.time(15, 30))

    def test_ist_date_of_utc(self) -> None:
        # 20:00 UTC on Mar 15 is 01:30 IST on Mar 16.
        self.assertEqual(
            ist_date(dt.datetime(2024, 3, 15, 20, 0, tzinfo=UTC)), dt.date(2024, 3, 16)
        )


class TestHashing(unittest.TestCase):
    def test_canonical_json_is_key_order_independent(self) -> None:
        self.assertEqual(canonical_json({"a": 1, "b": 2}), canonical_json({"b": 2, "a": 1}))

    def test_decimal_and_int_do_not_collide(self) -> None:
        self.assertNotEqual(content_hash(Decimal("1")), content_hash(1))

    def test_content_hash_stable_for_equal_content(self) -> None:
        a = {"x": Decimal("10.50"), "d": dt.date(2024, 1, 1)}
        b = {"d": dt.date(2024, 1, 1), "x": Decimal("10.50")}
        self.assertEqual(content_hash(a), content_hash(b))

    def test_naive_datetime_refused_in_hash(self) -> None:
        with self.assertRaises(ValueError):
            content_hash({"t": dt.datetime(2024, 1, 1, 0, 0)})

    def test_chain_detects_change(self) -> None:
        h1 = chain_hash(GENESIS_HASH, content_hash({"n": 1}))
        h2 = chain_hash(h1, content_hash({"n": 2}))
        # Changing record 1 changes h1 and therefore h2.
        h1b = chain_hash(GENESIS_HASH, content_hash({"n": 99}))
        h2b = chain_hash(h1b, content_hash({"n": 2}))
        self.assertNotEqual(h2, h2b)


if __name__ == "__main__":
    unittest.main()
