"""The validation framework: batches, checks, findings, reports, and the gate."""

from __future__ import annotations

import abc
import datetime as _dt
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from atlas.common.errors import DataQualityHalt
from atlas.common.hashing import content_hash
from atlas.common.types import Severity
from atlas.data.calendars.nse_calendar import TradingCalendar
from atlas.data.market.records import OHLCVBar


@dataclass(frozen=True)
class Finding:
    """A single data-quality observation."""

    check: str
    severity: Severity
    message: str
    entity_key: str | None = None
    context: Mapping[str, Any] = field(default_factory=dict)


@dataclass
class DataBatch:
    """Everything a set of checks may need. All auxiliary inputs are optional; a check
    that lacks its inputs simply produces no findings (it cannot run, so it stays silent).
    """

    bars: Sequence[OHLCVBar]
    calendar: TradingCalendar | None = None
    date_range: tuple[_dt.date, _dt.date] | None = None
    as_of_date: _dt.date | None = None
    prior_close: Mapping[str, Decimal] = field(default_factory=dict)
    ex_dates: Mapping[str, set[_dt.date]] = field(default_factory=dict)
    cross_source_close: Mapping[tuple[str, _dt.date], Decimal] = field(default_factory=dict)
    index_observed: Mapping[str, tuple[int, int]] = field(default_factory=dict)  # idx->(obs,exp)
    expected_instruments: frozenset[str] = frozenset()  # requested set, for drop detection
    max_stale_days: int = 5  # batch-freshness threshold (calendar days)


class Check(abc.ABC):
    """A composable validation check. Pure: same batch in, same findings out."""

    name: str = "check"

    @abc.abstractmethod
    def run(self, batch: DataBatch) -> list[Finding]:  # pragma: no cover - interface
        raise NotImplementedError


@dataclass(frozen=True)
class ValidationReport:
    """Aggregated result of running a suite over a batch."""

    findings: tuple[Finding, ...]
    generated_for: str | None = None  # e.g. an ingestion run id, for the audit trail

    @property
    def max_severity(self) -> Severity:
        return max((f.severity for f in self.findings), default=Severity.INFO)

    @property
    def halted(self) -> bool:
        """True if any finding is halting (ERROR or CRITICAL) — the fail-safe trigger."""
        return any(f.severity.halts for f in self.findings)

    @property
    def ok(self) -> bool:
        return not self.halted

    def by_severity(self, severity: Severity) -> tuple[Finding, ...]:
        return tuple(f for f in self.findings if f.severity == severity)

    def digest(self) -> str:
        """Stable content hash of the report — recorded in the audit trail."""
        return content_hash(
            [
                {"check": f.check, "severity": f.severity, "key": f.entity_key, "msg": f.message}
                for f in self.findings
            ]
        )

    def raise_if_halted(self) -> None:
        """Fail-safe: stop the pipeline if the data cannot be trusted."""
        if self.halted:
            raise DataQualityHalt(
                f"data-quality gate failed: {len(self.by_severity(Severity.ERROR))} error(s), "
                f"{len(self.by_severity(Severity.CRITICAL))} critical",
                report=self,
            )


class ValidationSuite:
    """An ordered collection of checks."""

    def __init__(self, checks: Sequence[Check]) -> None:
        self._checks = tuple(checks)

    @property
    def checks(self) -> tuple[Check, ...]:
        return self._checks

    def validate(self, batch: DataBatch, *, generated_for: str | None = None) -> ValidationReport:
        findings: list[Finding] = []
        for check in self._checks:
            try:
                findings.extend(check.run(batch))
            except Exception as exc:
                # Fail-safe: an errored check is treated as a failed check (data untrusted),
                # not a passed one, and it does not prevent the remaining checks from running.
                findings.append(
                    Finding(
                        check=getattr(check, "name", "unknown"),
                        severity=Severity.CRITICAL,
                        message=f"check errored: {type(exc).__name__}: {exc}",
                    )
                )
        # Stable ordering: worst first, then by check then entity — deterministic reports.
        findings.sort(key=lambda f: (-int(f.severity), f.check, f.entity_key or ""))
        return ValidationReport(tuple(findings), generated_for=generated_for)

    def gate(self, batch: DataBatch, *, generated_for: str | None = None) -> ValidationReport:
        """Validate and enforce fail-safe: raises :class:`DataQualityHalt` if halted."""
        report = self.validate(batch, generated_for=generated_for)
        report.raise_if_halted()
        return report
