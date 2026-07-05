"""Survivorship-bias-free index membership across both time axes."""

from __future__ import annotations

import datetime as dt
import unittest

from atlas.common.time_utils import UTC
from atlas.data.universe import UniverseLog


def _k(year: int, month: int, day: int) -> dt.datetime:
    return dt.datetime(year, month, day, 12, 0, tzinfo=UTC)


class TestSurvivorshipFreeUniverse(unittest.TestCase):
    def setUp(self) -> None:
        self.log = UniverseLog()
        # A: member from 2020-01-01 (known then).
        self.log.add_membership(index="NIFTY_50", instrument_id="A",
                                valid_from=dt.date(2020, 1, 1), knowledge_time=_k(2020, 1, 1),
                                source="idx")
        # B: added 2023-01-01 (known then).
        self.log.add_membership(index="NIFTY_50", instrument_id="B",
                                valid_from=dt.date(2023, 1, 1), knowledge_time=_k(2023, 1, 1),
                                source="idx")
        # A removed effective 2022-06-01, announced/known 2022-05-15 (restated interval).
        self.log.remove_membership(index="NIFTY_50", instrument_id="A",
                                   valid_from=dt.date(2020, 1, 1), valid_to=dt.date(2022, 6, 1),
                                   knowledge_time=_k(2022, 5, 15), source="idx")

    def test_removed_member_still_present_for_in_window_dates(self) -> None:
        """The core anti-survivorship property: A counts on a 2021 date even though it was
        later removed — a backtest of 2021 must see A."""
        members = self.log.constituents(index="NIFTY_50", event_date=dt.date(2021, 6, 1),
                                        known_as_of=_k(2024, 1, 1))
        self.assertEqual(members, {"A"})

    def test_removed_member_absent_after_removal(self) -> None:
        members = self.log.constituents(index="NIFTY_50", event_date=dt.date(2023, 6, 1),
                                        known_as_of=_k(2024, 1, 1))
        self.assertEqual(members, {"B"})

    def test_future_addition_invisible_to_earlier_knowledge(self) -> None:
        """B (added/known in 2023) must be invisible to a query made as-of 2022."""
        members = self.log.constituents(index="NIFTY_50", event_date=dt.date(2023, 6, 1),
                                        known_as_of=_k(2022, 1, 1))
        self.assertNotIn("B", members)


if __name__ == "__main__":
    unittest.main()
