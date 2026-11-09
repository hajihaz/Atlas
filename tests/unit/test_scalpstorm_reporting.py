"""Incomplete days must not disappear from period losses."""

from atlas.paper.scalpstorm_reporting import period_totals


def test_period_totals_include_incomplete_losses_and_all_fees():
    days = [
        {
            "date": "2026-10-01",
            "startingEquityPaise": 10000000,
            "endingEquityPaise": 9900000,
            "complete": False,
            "feesPaise": 100,
            "fills": 1,
        },
        {
            "date": "2026-10-02",
            "startingEquityPaise": 9900000,
            "endingEquityPaise": 9920000,
            "complete": True,
            "feesPaise": 200,
            "fills": 1,
        },
    ]
    row = period_totals(days, 7)[0]
    assert row["netPnlINR"] == -800
    assert row["returnPct"] == -0.8
    assert row["recordedSessions"] == 2
    assert row["completedSessions"] == 1
    assert row["incompleteSessions"] == 1
    assert row["feesINR"] == 3
    assert row["fills"] == 2
    assert period_totals([], 4) == []
