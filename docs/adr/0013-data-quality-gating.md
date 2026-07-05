# ADR 0013 — Data-Quality Gating (Fail-Safe)

> **Status:** Accepted
> **Date:** 2026-07-05
> **Deciders:** Atlas Division (Phase 2)
> **Phase:** 2 (Data Foundation & Research Infrastructure)

---

## Context

The Phase-2 exit criteria require that *"data-quality gates exist and can halt downstream use of bad/stale data."* [ADR 0008](0008-fail-safe-defaults-and-kill-switch.md) requires fail-safe defaults: on any doubt, Atlas stops rather than proceeds. Bad market data does not merely produce a wrong number — because the *risk* layer will later consume the same feeds ([threat model §4.5](../architecture/threat-model.md#45-market-data-poisoning-t3--asset-5)), poisoned data can simultaneously manufacture a signal and suppress the control that would stop it. Data quality is therefore a **safety** control, not a nicety.

## Decision

**Atlas validates data through a composable check framework whose findings carry a severity that drives a fail-safe gate** ([framework](../../src/atlas/data/quality/framework.py); [checks](../../src/atlas/data/quality/checks.py); [design](../data/data-quality.md)).

1. **Severity → action.** `INFO` records an explained event; `WARNING` flags an anomaly; **`ERROR`/`CRITICAL` halt** downstream use. A report with any halting finding fails the gate ([`raise_if_halted`](../../src/atlas/data/quality/framework.py)).
2. **Fail-safe by default.** The ingestion pipeline quarantines a batch that trips the gate — its load-set is empty, so **bad data never reaches the source of truth** ([pipeline](../../src/atlas/data/ingestion/pipeline.py)).
3. **Coverage is explicit.** Checks span missing data, duplicates, bad prices, corporate-action-unexplained jumps, universe drift, timestamp problems (future/non-session dates), stale prices, and **cross-source disagreement** (≥2-source corroboration for capital-affecting data, per [ADR 0009](0009-threat-model-and-security-baseline.md)).
4. **Deterministic & auditable.** Reports are order-stable and content-hashed (`digest`), and are recorded against the ingestion run in `data_quality_findings` for the audit trail.
5. **Checks are pure and independently testable;** the suite is extensible without touching the framework.

## Consequences

### Positive
- Bad/stale/poisoned data is stopped at the door, not discovered downstream in a backtest or (later) a trade.
- Data quality becomes a *tested, auditable* property with severity semantics, not a vibe.

### Negative / costs
- False positives can halt ingestion and require human triage (a deliberately accepted cost — [conservatism compounds](../principles.md#37-conservatism-compounds)).
- Thresholds (jump %, cross-source tolerance) need calibration per instrument class over time.

### Mitigations
- Thresholds are per-check parameters, tunable and versioned; WARNING vs ERROR lets anomalies be surfaced without halting where appropriate.
- Explained events (e.g. a CA-driven jump) are downgraded to INFO so legitimate moves don't cause false halts.

## Alternatives considered
- **Warn-only / log-and-continue.** Rejected: violates fail-safe — the warning is ignored exactly when it matters, and bad data reaches risk-relevant consumers.
- **Great Expectations.** A capable framework, but heavier and less code-native than the pure check protocol; the lightweight framework keeps the core dependency-free and fully testable. GX remains an option for richer profiling later.

## Principles upheld / traded
Upholds [2.4 fail-safe defaults](../principles.md#24-fail-safe-defaults), [2.5 defense in depth](../principles.md#25-defense-in-depth-for-risk), [1.2/1.3 survival-first](../principles.md). Trades some ingestion throughput/false-halt friction for data trustworthiness.

## Related
[data-quality.md](../data/data-quality.md) · [ADR 0008](0008-fail-safe-defaults-and-kill-switch.md) · [ADR 0009](0009-threat-model-and-security-baseline.md)
