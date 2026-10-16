"""Independent historical-window replay verification, not broker paper sessions."""

from __future__ import annotations

import datetime as dt
from dataclasses import asdict, dataclass
from pathlib import Path

from atlas.common.hashing import content_hash
from atlas.paper.historical_replay import replay_lean_history


@dataclass(frozen=True)
class CohortEvidence:
    start: str
    final_equity: str
    sessions: int
    source_snapshot_hash: str
    evidence_hash: str


@dataclass(frozen=True)
class HistoricalCohortReport:
    source_kind: str
    cohorts: tuple[CohortEvidence, ...]
    report_hash: str


def verify_disjoint_historical_cohorts(source: Path) -> HistoricalCohortReport:
    """Use fixed *unfitted* strategy, chronologically disjoint windows.

    Because the strategy is never tuned on previous windows, this is a
    robustness check, NOT proof of an optimized walk-forward strategy.
    """
    windows = (
        dt.date(2013, 10, 7),
        dt.date(2016, 6, 1),
        dt.date(2020, 9, 1),
    )
    cohorts = []
    for start in windows:
        result = replay_lean_history(source, start=start, sessions=125)
        if result.source_kind != "historical_lean_fixture_not_live_paper":
            raise RuntimeError("refusing to relabel historical data as real-market paper")
        if not result.evidence.clean_reconciliations or result.evidence.runtime_errors:
            raise RuntimeError("a historical cohort has unreconciled events")
        cohorts.append(
            CohortEvidence(
                start.isoformat(),
                str(result.equity_path[-1]),
                len(result.equity_path),
                result.snapshot_hash,
                result.envelope.evidence_hash,
            )
        )
    proof = tuple(cohorts)
    return HistoricalCohortReport(
        "historical_out_of_sample_fixed_strategy_not_live_paper",
        proof,
        content_hash([asdict(item) for item in proof]),
    )
