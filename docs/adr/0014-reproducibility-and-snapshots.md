# ADR 0014 — Reproducibility & Content-Addressed Snapshots

> **Status:** Accepted
> **Date:** 2026-07-05
> **Deciders:** Atlas Division (Phase 2)
> **Phase:** 2 (Data Foundation & Research Infrastructure)

---

## Context

[ADR 0005](0005-point-in-time-and-reproducible-research.md) requires that a result be reproducible or it is not evidence, scoped "by class" (bit-for-bit on the deterministic path; by-provenance for non-deterministic outputs). Phase 3 backtests will pin their inputs and must reproduce **exactly**. That requires the data layer to provide immutable, identifiable, verifiable datasets and to answer the four reproducibility questions: *which data was used, when it was collected, which source provided it, and can this be reproduced?*

## Decision

**Atlas provides content-addressed, immutable snapshots plus pervasive provenance** ([manifest](../../src/atlas/data/snapshots/manifest.py); [provenance](../../src/atlas/data/lineage/provenance.py); [design](../data/reproducibility.md)).

1. **A snapshot is a materialized as-of query** — "the world as known at knowledge time *K*, for this universe/query spec." Its identity is its **content hash**; a `SnapshotManifest` records the digest, row count, sources, `as_of`, code version, and dependency-lock hash.
2. **Verification is built in.** Re-materializing the same as-of query must reproduce the digest; [`verify_manifest`](../../src/atlas/data/snapshots/manifest.py) proves it and raises `ReproducibilityError` otherwise. A backtest that pins a `snapshot_id` is guaranteed bit-identical inputs forever.
3. **Provenance on every artifact.** Normalized bars, snapshots, and trials carry a `Provenance` record (source, collected-at/knowledge time, ingestion run, code version, dependency-lock hash, upstream ids) — answering the four questions from the audit trail alone.
4. **Determinism at the boundary.** Prices are `Decimal` (never float); randomness (where later introduced) is seeded and recorded; canonical hashing is byte-stable across machines. Because the store is bitemporal ([ADR 0011](0011-bitemporal-point-in-time-model.md)), *re-running an as-of query at the same K deterministically returns the same data*.
5. **Snapshots persist to columnar Parquet** in object storage (immutable, cheap, tiered), indexed by the `snapshots` table.

## Consequences

### Positive
- Backtests become reproducible from a single `snapshot_id`; disputes are settled by re-verification.
- The four reproducibility questions have first-class, auditable answers.
- Snapshots decouple slow bitemporal materialization from fast repeated research reads.

### Negative / costs
- Snapshot storage grows with research activity; managed by retention tiers.
- Discipline: research must pin snapshots rather than query "latest" — enforced by the Phase-3 research API.

### Mitigations
- Content-addressing de-duplicates identical snapshots automatically.
- Tiered Parquet storage bounds cost over a decade ([NFR §8](../architecture/non-functional-requirements.md#8-data-retention)).

## Alternatives considered
- **Re-query the live DB per backtest (no snapshots).** Rejected: as-of queries are correct but slow to repeat, and pinning an id is a cleaner reproducibility contract; still available as the source that snapshots materialize from.
- **Store random UUIDs for snapshots.** Rejected: content-addressing is what makes identity == content and enables dedup and verification.

## Principles upheld / traded
Upholds [2.2 reproducibility & determinism](../principles.md#22-reproducibility-and-determinism), [2.7 traceability](../principles.md#27-full-traceability-lineage), [1.4 evidence over opinions](../principles.md#14-evidence-over-opinions). Trades snapshot storage for reproducibility — a foundational, non-negotiable trade.

## Related
[reproducibility.md](../data/reproducibility.md) · [ADR 0005](0005-point-in-time-and-reproducible-research.md) · [ADR 0011](0011-bitemporal-point-in-time-model.md)
