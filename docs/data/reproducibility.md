# Atlas — Reproducibility Infrastructure

> **Status:** Ratified · Phase 2 · **Owner:** Atlas Division
> **Related:** [data-architecture.md](data-architecture.md) · [ADR 0014](../adr/0014-reproducibility-and-snapshots.md) · [ADR 0005](../adr/0005-point-in-time-and-reproducible-research.md)

---

## 1. The four questions

Atlas must always be able to answer, for any dataset or result:

1. **Which data was used?** → a `snapshot_id` + its manifest (content digest, row count, universe spec).
2. **When was it collected?** → each record's `knowledge_from`; the snapshot's `as_of`.
3. **Which source provided it?** → provenance (`source`, `ingestion_run_id`) on every artifact.
4. **Can this be reproduced?** → yes — re-materialize the as-of query and `verify_manifest`.

## 2. Snapshots — content-addressed, immutable

[`atlas.data.snapshots`](../../src/atlas/data/snapshots/manifest.py). A **snapshot** is a materialized as-of query — "the world as known at knowledge time *K*, for this universe/query spec." Its **identity is its content hash**, so:

- A backtest that pins a `snapshot_id` is guaranteed **bit-identical inputs forever** ([ADR 0014](../adr/0014-reproducibility-and-snapshots.md)).
- Re-materializing must reproduce the digest; [`verify_manifest`](../../src/atlas/data/snapshots/manifest.py) proves it and raises `ReproducibilityError` on any drift.
- Identical snapshots **de-duplicate** automatically (same content → same id).
- Manifests record `as_of`, `content_digest`, `row_count`, `sources`, `code_version`, and `dependency_lock_hash`; the bulk data persists as columnar **Parquet** in object storage, indexed by the `snapshots` table.
- The `snapshot_id` itself incorporates **`code_version` and `dependency_lock_hash`** (not just content) — because the adjusted series is *derived in code* (adjust-on-read), "same `snapshot_id`" must imply "same code that produced it", closing a collision the content-only id would allow.

Verified by `tests/reproducibility/test_reproducibility.py`.

## 3. Provenance & lineage

[`atlas.data.lineage`](../../src/atlas/data/lineage/provenance.py). Every normalized bar, snapshot, and trial carries a `Provenance` record: `source`, `collected_at` (knowledge time), `ingestion_run_id`, `code_version`, `dependency_lock_hash`, and `upstream` artifact ids. Lineage is thus traceable end-to-end from a result back to the raw vendor payload ([NFR §4](../architecture/non-functional-requirements.md#4-traceability-lineage)) — no unsourced data can influence anything.

## 4. Determinism ("reproducible by class")

Per [ADR 0005](../adr/0005-point-in-time-and-reproducible-research.md):

- **Deterministic path is bit-for-bit** — the bitemporal store returns the same data for the same as-of query (`K`), because the store is append-only and immutable; prices are `Decimal`; canonical hashing is byte-stable across machines; the pipeline reads no clock (knowledge time is passed in).
- **Non-deterministic outputs are frozen by provenance** — when LLM/parallel-compute outputs enter (later phases), the exact artifact is recorded the moment it is used, so the *artifact that counted as evidence* is fixed even if a re-run would differ.

## 5. Environment capture

Reproducibility needs the *code* and *deps*, not just the data. Ingestion runs and snapshots record `code_version` (git SHA) and `dependency_lock_hash` (the hash-locked `uv.lock` — supply-chain, [ADR 0009](../adr/0009-threat-model-and-security-baseline.md)). Given (snapshot_id + code_version + lock_hash + seed), a result is fully reconstructable.

## 6. How Phase 3 will use this

A backtest declares `(strategy_version × snapshot_id × params × seed)`. Because the snapshot is content-addressed and immutable and the code/deps are pinned, the run is **bit-for-bit reproducible** — which is exactly [Phase 3's exit criterion](../roadmap.md#phase-3--the-reproducible-backtesting-engine). Phase 2 makes that possible.
