"""Integration: the PostgreSQL bitemporal layer must match the pure reference semantics.

Skipped unless ``ATLAS_TEST_DB`` points at a throwaway Postgres. This is the test that
proves the *storage* implements exactly what ``atlas.data.bitemporal`` specifies — the same
as-of answers, no look-ahead. Requires the ``ingest`` extra (SQLAlchemy).
"""

from __future__ import annotations

import datetime as dt
import os

import pytest

pytestmark = pytest.mark.integration

_DB = os.environ.get("ATLAS_TEST_DB")


@pytest.mark.skipif(not _DB, reason="ATLAS_TEST_DB not set")
def test_sql_asof_matches_reference() -> None:
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session

    from atlas.common.time_utils import FAR_FUTURE, UTC
    from atlas.data.models import Base, InstrumentRow, OHLCVObservation

    engine = create_engine(_DB, future=True)
    Base.metadata.create_all(engine)

    t16 = dt.datetime(2024, 3, 16, 10, 0, tzinfo=UTC)
    t18 = dt.datetime(2024, 3, 18, 10, 0, tzinfo=UTC)
    with Session(engine) as s:
        s.add(InstrumentRow(instrument_id="inst_x", symbol="X", name="X Ltd",
                            instrument_type="equity"))
        # v0 (close 100) known [t16, t18); v1 correction (close 101) known [t18, FAR_FUTURE)
        s.add(OHLCVObservation(instrument_id="inst_x", event_date=dt.date(2024, 3, 15),
                               open=100, high=100, low=100, close=100, volume=1, source="v",
                               knowledge_from=t16, knowledge_to=t18, revision=0))
        s.add(OHLCVObservation(instrument_id="inst_x", event_date=dt.date(2024, 3, 15),
                               open=101, high=101, low=101, close=101, volume=1, source="v",
                               knowledge_from=t18, knowledge_to=FAR_FUTURE, revision=1))
        s.commit()

    def asof_close(as_of: dt.datetime):
        with Session(engine) as s:
            stmt = (
                select(OHLCVObservation.close)
                .where(OHLCVObservation.instrument_id == "inst_x")
                .where(OHLCVObservation.knowledge_from <= as_of)
                .where(OHLCVObservation.knowledge_to > as_of)
            )
            return s.execute(stmt).scalar_one()

    t17 = dt.datetime(2024, 3, 17, 10, 0, tzinfo=UTC)
    t19 = dt.datetime(2024, 3, 19, 10, 0, tzinfo=UTC)
    assert asof_close(t17) == 100  # what we knew on the 17th
    assert asof_close(t19) == 101  # after the correction
    Base.metadata.drop_all(engine)
