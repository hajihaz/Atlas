# ADR 0012 — The Trial Ledger

> **Status:** Accepted
> **Date:** 2026-07-05
> **Deciders:** Atlas Division (Phase 2)
> **Phase:** 2 (Data Foundation & Research Infrastructure)

---

## Context

The Phase-1 review ([ADR 0001 Appendix B.2](0001-record-architecture-decisions.md#appendix-b--phase-1-architecture-review)) established that multiple-testing correction is only meaningful against the **total number of trials across the whole research program** — the multiplicity denominator. Without a durable, tamper-evident record of every experiment, the deflated-Sharpe / probability-of-backtest-overfitting defenses ([ADR 0005](0005-point-in-time-and-reproducible-research.md)) are decorative, and Atlas cannot honestly answer *"how many ideas did we test, and which survived?"* Strategies do not exist until Phase 3+, but the ledger they must write to is a Phase-2 foundation.

## Decision

**Atlas records every research trial in an append-only, hash-chained Trial Ledger** ([reference](../../src/atlas/trials/ledger.py); [design](../research/trial-ledger.md)).

1. **Every experiment is a trial** — every parameter set, every optimization attempt, every AI-proposed candidate. A trial's evolution (proposed → running → completed/failed → rejected/promoted) is recorded as **append-only records**, never in-place mutation.
2. **Trials belong to a family.** The **family-level trial count** is the multiplicity denominator consumed by later overfitting corrections ([`family_trial_count`](../../src/atlas/trials/ledger.py)).
3. **Hash-chained, tamper-evident against in-place edits.** Each entry commits to the previous (`chain_hash`); any later edit breaks every subsequent link. Self-verification does **not** catch *truncation* or a *re-chain from genesis* — those require pinning `head_checkpoint()` to an **external append-only/WORM witness** the writer cannot rewrite; `verify_integrity(checkpoint=…)` then detects them. External anchoring is a **Phase-7 entry gate** (no live capital before it); the Postgres table is additionally made append-only by DB triggers ([migration 0002](../../database/migrations/versions/0002_integrity_hardening.py)). ([ADR 0009](0009-threat-model-and-security-baseline.md) §4.2 / F-B4).
4. **Provenance-bound.** Each record carries the data snapshot id, seed, code version, and metrics needed to reproduce and audit the trial.
5. **Storage-agnostic** behind a `LedgerStore` protocol: an in-memory reference, a JSONL file (dev), and a Postgres append-only table (`trial_ledger`) all satisfy the same semantics.

## Consequences

### Positive
- The overfitting defenses get a real denominator — data-snooping across the program is measurable ([F-C6](../failure-criteria.md#category-c--process--discipline-failures)).
- Atlas can answer the honest questions (tested / failed / survived / promoted) from one auditable log.
- Tampering with research history is detectable.

### Negative / costs
- Discipline cost: every experiment *must* write to the ledger, or the count under-reports (and corrections over-optimistic). This is a process obligation on Phase-3 tooling.

### Mitigations
- Phase 3's experiment runner will write to the ledger automatically (not left to human diligence); the ledger is wired in before strategies exist so there is no "add it later" gap.

## Alternatives considered
- **Log trials in notebooks / ad-hoc files.** Rejected: not tamper-evident, not countable, not auditable — exactly the data-snooping hole.
- **Count only "final" strategies.** Rejected: that *is* the survivorship/multiplicity bias — the discarded siblings are the ones that inflate the survivors.
- **A generic audit log.** The ledger *is* specialized audit; a generic log lacks the family/multiplicity semantics.

## Principles upheld / traded
Upholds [1.4 evidence over opinions](../principles.md#14-evidence-over-opinions), statistical humility, [2.6 immutability](../principles.md#26-immutability-and-auditability). No material trade — it is pure integrity infrastructure.

## Related
[trial-ledger.md](../research/trial-ledger.md) · [ADR 0005](0005-point-in-time-and-reproducible-research.md) · [ADR 0009](0009-threat-model-and-security-baseline.md)
