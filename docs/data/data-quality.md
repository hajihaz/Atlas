# Atlas — Data Quality System

> **Status:** Ratified · Phase 2 · **Owner:** Atlas Division
> **Related:** [data-architecture.md](data-architecture.md) · [ADR 0013](../adr/0013-data-quality-gating.md) · [framework.py](../../src/atlas/data/quality/framework.py) · [checks.py](../../src/atlas/data/quality/checks.py)

---

## 1. Principle: data quality is a safety control

Bad data does not merely produce a wrong number. Because the future risk layer consumes the same feeds, poisoned data can *manufacture a signal and suppress the control that would stop it* ([threat model §4.5](../architecture/threat-model.md#45-market-data-poisoning-t3--asset-5)). So Atlas treats validation as **fail-safe gating**, not reporting: on any halting finding, downstream use **stops** ([ADR 0008](../adr/0008-fail-safe-defaults-and-kill-switch.md) / [ADR 0013](../adr/0013-data-quality-gating.md)).

## 2. The framework

[`atlas.data.quality`](../../src/atlas/data/quality/): composable **Checks** run over a **DataBatch**, producing **Findings** aggregated into a **ValidationReport**; a **ValidationSuite** runs them and its `gate()` enforces fail-safe.

- **Severity drives action** ([`Severity`](../../src/atlas/common/types.py)): `INFO` (explained event) · `WARNING` (anomaly to investigate) · **`ERROR` / `CRITICAL` (halt)**.
- `report.halted` ⇔ any finding is `ERROR`+; `raise_if_halted()` throws `DataQualityHalt` carrying the report.
- Reports are **deterministic** (stable ordering) and **content-hashed** (`digest()`) so they are auditable and recorded against the ingestion run (`data_quality_findings`).
- Checks are **pure and independently testable**; a check lacking its inputs stays silent (produces nothing) rather than guessing.

## 3. The checks

| Requirement | Check | Severity | Rationale |
|---|---|---|---|
| **Bad prices** | `OHLCVIntegrityCheck` | ERROR | OHLC ordering, positivity, non-negative volume |
| **Duplicate data** | `DuplicateBarCheck` | ERROR | same (instrument, session) twice |
| **Timestamp problems** | `FutureDateCheck` | **CRITICAL** | a bar dated after the knowledge date = look-ahead |
| | `NonSessionDateCheck` | ERROR | bar on a weekend/holiday |
| **Missing data** | `MissingSessionCheck` | ERROR | session in range with no bar |
| **Corporate-action issues** | `PriceJumpCheck` | ERROR / INFO | large jump *unexplained* by a CA (ERROR) vs *explained* (INFO) |
| **Bad prices (stale)** | `StalePriceCheck` | WARNING | unchanged close + zero volume |
| **Data-source disagreement** | `CrossSourceDisagreementCheck` | ERROR | ≥2-source corroboration beyond tolerance |
| **Universe drift** | `UniverseSizeCheck` | ERROR | observed constituents ≠ expected (50/100/200) |

Thresholds (jump %, cross-source tolerance) are per-check parameters, tunable and versioned. `default_suite()` wires the standard set; verified by `tests/unit/test_quality.py`.

## 4. Where the gate sits

The [ingestion pipeline](../../src/atlas/data/ingestion/pipeline.py) validates every batch. **If the gate halts, the load-set is empty AND `ingest()` raises `DataQualityHalt` by default (`strict=True`)** — the gate cannot be silently ignored by a forgetful caller, and the CLI exits non-zero. Bad data never reaches the source of truth. Halting findings and the run are recorded, and (in production) the operator is alerted via Jarvis ([reporting](../architecture/overview.md#38-reporting-layer)). This is the concrete realization of "data-quality gates can halt downstream use of bad/stale data" — the Phase-2 exit criterion.

**Enforcement details (post-review hardening):**
- A check that **errors** is treated as a *failed* check (synthesizes a CRITICAL finding), never a passed one, and does not stop the remaining checks — fail-safe, not fail-open.
- The pipeline **threads** each check's inputs (`ex_dates`, `cross_source_close`, `index_observed`, `expected_instruments`, `prior_close`); a check with no inputs cannot run, so where a control is *required* it is enforced by a coverage check rather than silent absence.
- **Cross-source corroboration** runs whenever a second source's closes are supplied. Making it *mandatory* for capital-affecting data (fail on missing corroboration) activates when a real second vendor is wired in — a Phase-3 step with its own ADR; today's adapters are deterministic single-source mocks.
- **Calendar coverage** halts if the validation range exceeds the calendar's known-complete range (the dev-seed NSE list is bounded to 2024–2025, so misuse fails loud instead of mis-classifying sessions).

## 5. Explained vs. suspicious

A legitimate large move (a stock down 50% on a 1:2 split ex-date) must not cause a false halt. `PriceJumpCheck` downgrades a jump to **INFO** when a corporate action is known on that date, and escalates to **ERROR** only when the jump is *unexplained* — likely a bad price or a missing corporate action. This keeps the gate trusted rather than noisy.

## 6. Extending the system

Add a `Check` subclass and include it in the suite; no framework change needed. Candidate future checks: volume spikes, bid-ask/spread sanity (when microstructure arrives), holiday-list drift, and vendor-latency monitoring. Each new check declares its severity — and therefore whether it halts.
