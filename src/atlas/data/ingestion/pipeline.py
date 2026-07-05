"""The ingestion pipeline: fetch → validate (gate) → provenance-stamped bitemporal load-set.

Pure and deterministic given (adapter output, knowledge_time). Fail-safe: if the quality
gate halts, the load-set is empty — bad data is *never* handed to persistence. Idempotent:
re-running with the same inputs and knowledge_time yields byte-identical load instructions,
so persistence can dedupe on ``(key, knowledge_from)``.
"""

from __future__ import annotations

import datetime as _dt
from dataclasses import dataclass
from typing import Mapping

from atlas.common.errors import DataQualityHalt
from atlas.common.ids import ingestion_run_id
from atlas.common.time_utils import FAR_FUTURE, ist_date, require_aware, to_utc
from atlas.data.bitemporal.records import BitemporalVersion
from atlas.data.calendars.nse_calendar import TradingCalendar
from atlas.data.ingestion.adapter import FetchRequest, VendorAdapter
from atlas.data.lineage.provenance import Provenance, stamp
from atlas.data.quality.framework import DataBatch, ValidationReport, ValidationSuite


@dataclass(frozen=True)
class IngestionResult:
    """Outcome of one ingestion run."""

    run_id: str
    report: ValidationReport
    provenance: Provenance
    load_set: tuple[BitemporalVersion, ...] = ()
    halted: bool = False

    def raise_if_halted(self) -> None:
        if self.halted:
            raise DataQualityHalt(f"ingestion run {self.run_id} halted by quality gate", self.report)


def ingest(
    adapter: VendorAdapter,
    request: FetchRequest,
    *,
    knowledge_time: _dt.datetime,
    suite: ValidationSuite,
    calendar: TradingCalendar | None = None,
    prior_close: Mapping[str, object] | None = None,
    ex_dates: Mapping[str, set[_dt.date]] | None = None,
    cross_source_close: Mapping[tuple[str, _dt.date], object] | None = None,
    index_observed: Mapping[str, tuple[int, int]] | None = None,
    expected_instruments: frozenset[str] | None = None,
    code_version: str | None = None,
    dependency_lock_hash: str | None = None,
    strict: bool = True,
) -> IngestionResult:
    """Run one ingestion: fetch, validate, and (only if clean) build the load-set.

    ``knowledge_time`` is the moment this data became known — the bitemporal
    ``knowledge_from`` for every loaded version. Passing it in (rather than reading a clock)
    keeps the pipeline deterministic and lets you reproduce a historical ingestion exactly.

    The auxiliary inputs (``ex_dates``, ``cross_source_close``, ``index_observed``,
    ``expected_instruments``) are threaded to the quality checks that need them; without
    them those checks cannot run. **Fail-safe:** with ``strict=True`` (the default) a halting
    quality finding **raises** :class:`DataQualityHalt` — the gate cannot be silently ignored
    by a forgetful caller. ``strict=False`` returns a ``halted`` result with an empty
    load-set (for programmatic inspection); either way, bad data is never loaded.
    """
    knowledge_time = to_utc(require_aware(knowledge_time, field="knowledge_time"))
    run_id = ingestion_run_id(
        adapter.name,
        knowledge_time.isoformat(),
        {"symbols": list(request.symbols), "start": request.start.isoformat(),
         "end": request.end.isoformat()},
    )
    bars = adapter.fetch(request)

    batch = DataBatch(
        bars=bars,
        calendar=calendar,
        date_range=(request.start, request.end),
        as_of_date=ist_date(knowledge_time),  # the IST session date we could know as-of
        prior_close=dict(prior_close or {}),  # type: ignore[arg-type]
        ex_dates=dict(ex_dates or {}),
        cross_source_close=dict(cross_source_close or {}),  # type: ignore[arg-type]
        index_observed=dict(index_observed or {}),
        expected_instruments=expected_instruments or frozenset(),
    )
    report = suite.validate(batch, generated_for=run_id)

    provenance = stamp(
        source=adapter.name,
        collected_at=knowledge_time,
        ingestion_run_id=run_id,
        code_version=code_version,
        dependency_lock_hash=dependency_lock_hash,
    )

    if report.halted:
        # Fail-safe: quarantine the whole batch. Nothing bad reaches the source of truth.
        result = IngestionResult(run_id, report, provenance, load_set=(), halted=True)
        if strict:
            result.raise_if_halted()
        return result

    load_set = tuple(
        BitemporalVersion(
            key=bar.key(),
            knowledge_from=knowledge_time,
            knowledge_to=FAR_FUTURE,
            payload=bar.to_payload(),
            source=adapter.name,
            meta={"run_id": run_id},
        )
        for bar in bars
    )
    return IngestionResult(run_id, report, provenance, load_set=load_set, halted=False)
