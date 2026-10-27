"""Evidence gates attached to hypothetical archive results, never source certification."""

from __future__ import annotations

from dataclasses import dataclass

from atlas.integrations.history_quality import HistoricalQualityReport, audit_history
from atlas.integrations.history_store import ArchiveProvenance, CandleArchive
from atlas.integrations.source_comparison import SourceComparison, compare_history_sources


@dataclass(frozen=True)
class ResearchEvidence:
    status: str
    quality: HistoricalQualityReport
    provenance: ArchiveProvenance
    cross_source_status: str
    comparison: SourceComparison | None
    secondary_provenance: ArchiveProvenance | None
    warnings: tuple[str, ...]
    certified: bool = False
    strategy_qualified: bool = False
    live_orders_enabled: bool = False


def research_evidence(
    archive: CandleArchive,
    *,
    provider: str,
    instrument: str,
    interval: str,
    other_provider: str | None = None,
    other_instrument: str | None = None,
) -> ResearchEvidence:
    if bool(other_provider) != bool(other_instrument):
        raise ValueError("cross-source evidence requires both secondary provider and instrument")
    quality = audit_history(archive, provider=provider, instrument=instrument, interval=interval)
    # A damaged receipt stops research rather than producing apparently audited returns.
    provenance = archive.provenance(provider, instrument, interval)
    if provenance.observed_candles != quality.observed_bars:
        raise ValueError("archive changed during evidence audit; retry a stable snapshot")
    warnings = [
        "Source rights and provider authentication remain unverified.",
        "Exchange calendar, complete sessions and point-in-time universe are unverified.",
        "Local receipt checksums prove local integrity only, not authentic market evidence.",
    ]
    if quality.observed_missing_intraday_bars:
        warnings.append(
            f"{quality.observed_missing_intraday_bars} missing intraday bars observed; "
            "replay spans incomplete data."
        )
    if quality.unusual_off_session_bars or quality.nonaligned_intervals:
        warnings.append("Off-session or nonaligned timestamps need review.")
    if provenance.legacy_unattributed_candles:
        warnings.append(
            f"{provenance.legacy_unattributed_candles} archived candles lack ingestion receipts."
        )
    comparison = None
    secondary_provenance = None
    cross_status = "NOT_CHECKED"
    if other_provider and other_instrument:
        secondary_provenance = archive.provenance(other_provider, other_instrument, interval)
        comparison = compare_history_sources(
            archive,
            primary_provider=provider,
            primary_instrument=instrument,
            secondary_provider=other_provider,
            secondary_instrument=other_instrument,
            interval=interval,
        )
        cross_status = comparison.status
        if secondary_provenance.observed_candles != comparison.secondary_observed_bars:
            raise ValueError("secondary archive changed during evidence audit")
        if secondary_provenance.legacy_unattributed_candles:
            warnings.append("Secondary source contains candles without ingestion receipts.")
        warnings.append(
            "Cross-source observations agree only on overlap; this does not certify data."
            if cross_status == "UNCERTIFIED_VENDOR_OBSERVATIONS_AGREE_ON_OVERLAP"
            else "Cross-source missing or disputed candles need review; no source winner selected."
        )
    else:
        warnings.append("Cross-source discrepancies have not been checked.")
    return ResearchEvidence(
        "UNCERTIFIED_HYPOTHETICAL_RESEARCH",
        quality,
        provenance,
        cross_status,
        comparison,
        secondary_provenance,
        tuple(warnings),
    )
