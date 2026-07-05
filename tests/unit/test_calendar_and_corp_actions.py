"""NSE calendar sessions/gaps and corporate-action adjustment math."""

from __future__ import annotations

import datetime as dt
import unittest
from decimal import Decimal

from atlas.common.types import CorporateActionType
from atlas.data.adjustments import CorporateAction, cumulative_price_factor, price_factor
from atlas.data.calendars import TradingCalendar


class TestTradingCalendar(unittest.TestCase):
    def setUp(self) -> None:
        # A controlled calendar: one holiday on Wed 2024-03-13.
        self.cal = TradingCalendar("TEST", frozenset({dt.date(2024, 3, 13)}))

    def test_weekend_is_not_session(self) -> None:
        self.assertFalse(self.cal.is_session(dt.date(2024, 3, 16)))  # Saturday
        self.assertFalse(self.cal.is_session(dt.date(2024, 3, 17)))  # Sunday

    def test_holiday_is_not_session(self) -> None:
        self.assertFalse(self.cal.is_session(dt.date(2024, 3, 13)))

    def test_sessions_in_range_excludes_weekend_and_holiday(self) -> None:
        sessions = self.cal.sessions_in_range(dt.date(2024, 3, 11), dt.date(2024, 3, 17))
        # Mon 11, Tue 12, (Wed 13 holiday), Thu 14, Fri 15 -> 4 sessions
        self.assertEqual(sessions, [dt.date(2024, 3, d) for d in (11, 12, 14, 15)])
        self.assertEqual(self.cal.expected_session_count(dt.date(2024, 3, 11), dt.date(2024, 3, 17)), 4)

    def test_next_and_previous_session_skip_closures(self) -> None:
        self.assertEqual(self.cal.next_session(dt.date(2024, 3, 12)), dt.date(2024, 3, 14))  # skip 13
        self.assertEqual(self.cal.previous_session(dt.date(2024, 3, 14)), dt.date(2024, 3, 12))


class TestCorporateActions(unittest.TestCase):
    def test_split_factor(self) -> None:
        # 1 -> 5 split: pre-split prices scale by 1/5.
        ca = CorporateAction("i", CorporateActionType.SPLIT, dt.date(2024, 3, 15),
                             {"old": "1", "new": "5"})
        self.assertEqual(price_factor(ca), Decimal("0.2"))

    def test_bonus_factor(self) -> None:
        # 1:1 bonus: holder doubles shares; pre-bonus prices scale by 1/2.
        ca = CorporateAction("i", CorporateActionType.BONUS, dt.date(2024, 3, 15),
                             {"held": "1", "bonus": "1"})
        self.assertEqual(price_factor(ca), Decimal("0.5"))

    def test_dividend_factor_requires_ref(self) -> None:
        ca = CorporateAction("i", CorporateActionType.DIVIDEND, dt.date(2024, 3, 15),
                             {"amount": "5"})
        self.assertEqual(price_factor(ca, ref_close=Decimal("100")), Decimal("0.95"))
        with self.assertRaises(ValueError):
            price_factor(ca)  # no ref close

    def test_cumulative_only_applies_actions_after_bar_date(self) -> None:
        split = CorporateAction("i", CorporateActionType.SPLIT, dt.date(2024, 3, 20),
                                {"old": "1", "new": "2"})
        # Bar before the split -> adjusted by 0.5; bar after the split -> unaffected (factor 1).
        self.assertEqual(cumulative_price_factor([split], dt.date(2024, 3, 15)), Decimal("0.5"))
        self.assertEqual(cumulative_price_factor([split], dt.date(2024, 3, 25)), Decimal("1"))


if __name__ == "__main__":
    unittest.main()
