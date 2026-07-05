# ADR 0011 — Bitemporal Point-in-Time Data Model

> **Status:** Accepted
> **Date:** 2026-07-05
> **Deciders:** Atlas Division (Phase 2)
> **Phase:** 2 (Data Foundation & Research Infrastructure)

---

## Context

[ADR 0005](0005-point-in-time-and-reproducible-research.md) mandated point-in-time correctness and forbade silent restatement. Phase 2 must realize that as a concrete storage model. Market data is **revised**: vendors correct prices, corporate actions announced later retroactively change adjusted prices, and index constituents are reconstituted. A model that overwrites on revision destroys the ability to ask *"what did we know then?"* — the foundation of honest backtesting.

## Decision

**Atlas stores facts bitemporally with an append-only, adjust-on-read model.** Two time axes:

- **valid time** — when a fact is *about* (a session date; a membership interval);
- **knowledge time** — when Atlas *learned* it (`knowledge_from`/`knowledge_to`).

Rules ([reference implementation](../../src/atlas/data/bitemporal/asof.py); [design doc](../data/point-in-time.md)):

1. **Append-only.** A correction INSERTs a new version and closes the prior one (`knowledge_to = correction time`); nothing is UPDATEd in place. The "current" version has `knowledge_to = FAR_FUTURE` (an explicit `9999-12-31Z` sentinel, not NULL — portable and comparable).
2. **As-of resolution is the universal primitive.** A query as-of knowledge time *K* returns, per fact, the single version whose `[knowledge_from, knowledge_to)` contains *K*. **Versions learned after *K* are invisible → look-ahead is structurally impossible.**
3. **Raw prices are the source of truth; adjustment is on read.** Unadjusted OHLCV is immutable; adjusted prices are derived from the corporate actions *known as-of K* ([adjustments](../../src/atlas/data/adjustments/corporate_actions.py)). Storing adjusted prices would be a silent restatement (F-B1).
4. **Instruments are never deleted;** the universe is survivorship-free because delisted/removed names persist and index membership is itself bitemporal ([universe](../../src/atlas/data/universe/membership.py)).
5. **All timestamps are timezone-aware** (naive datetimes are rejected at every boundary); knowledge time is UTC, sessions are IST.
6. **The pure reference semantics ([`asof.py`](../../src/atlas/data/bitemporal/asof.py)) define correctness; the SQL layer must match them** — asserted by the integration test.

## Consequences

### Positive
- "What did we know at time *K*?" is answerable and *provable* — the Phase-2 exit criterion.
- No look-ahead, survivorship, or restatement leakage is possible by construction, not by discipline.
- Full revision history is retained for audit and reproducibility.

### Negative / costs
- More storage (every version kept) and more complex queries (as-of joins) than a naive "latest value" table.
- Adjust-on-read costs compute; hot paths may need materialized, provenance-stamped adjusted snapshots (still regenerable).

### Mitigations
- Storage is cheap and tiered ([NFR §8](../architecture/non-functional-requirements.md#8-data-retention)); indexes (`ix_ohlcv_asof`, partial-unique-current) keep as-of queries fast. **Declarative `event_date` partitioning is a planned follow-up migration** (not yet in place) for 10-year scale.
- The append-only invariant, the "one current version" guard, and non-overlapping knowledge intervals are enforced at the DB by [migration 0002](../../database/migrations/versions/0002_integrity_hardening.py) (triggers, partial-unique indexes, `btree_gist` EXCLUDE constraints) — not just by application code.
- The reference `BitemporalStore` gives a simple mental model and a test oracle for the SQL. Note: `as_of` must be a concrete time strictly before the `FAR_FUTURE` sentinel (querying *at* the sentinel is rejected, not silently empty).

## Alternatives considered
- **Overwrite-on-revision (single current value).** Rejected: destroys point-in-time truth — the cardinal sin.
- **Valid-time only (SCD-2) without knowledge time.** Rejected: cannot answer "what we knew then" vs "what was true then" — both are needed.
- **Store adjusted prices.** Rejected: adjusted values are only defined relative to a knowledge time; storing them restates history.
- **Event-sourcing everything.** The append-only versioning *is* lightweight event-sourcing for facts; a full event bus is unnecessary complexity for Phase 2.

## Principles upheld / traded
Upholds [2.1 point-in-time correctness](../principles.md#21-point-in-time-correctness-no-time-travel), [2.6 immutability](../principles.md#26-immutability-and-auditability), [2.7 traceability](../principles.md#27-full-traceability-lineage). Trades storage/query complexity for evidence integrity.

## Related
[point-in-time.md](../data/point-in-time.md) · [market-data-model.md](../data/market-data-model.md) · [ADR 0005](0005-point-in-time-and-reproducible-research.md) · [ADR 0014](0014-reproducibility-and-snapshots.md)
