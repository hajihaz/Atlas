import datetime as dt
import unittest

from atlas.market.boundary import MarketDataBoundary, MarketDataStatus


class MarketBoundaryAdversarialTests(unittest.TestCase):
    def test_future_observation_rejected(self):
        now = dt.datetime(2026, 9, 27, 10, tzinfo=dt.UTC)
        status = MarketDataStatus("s", now, now + dt.timedelta(seconds=1), dt.timedelta(minutes=5))
        with self.assertRaises(ValueError):
            MarketDataBoundary().admit(status)

    def test_stale_and_naive_rejected(self):
        now = dt.datetime(2026, 9, 27, 10, tzinfo=dt.UTC)
        stale = MarketDataStatus("s", now, now - dt.timedelta(hours=1), dt.timedelta(minutes=5))
        with self.assertRaises(ValueError):
            MarketDataBoundary().admit(stale)
        naive = MarketDataStatus("s", now.replace(tzinfo=None), now, dt.timedelta(minutes=5))
        with self.assertRaises(ValueError):
            MarketDataBoundary().admit(naive)
