# Atlas — Point-in-Time Design

> **Status:** Ratified · Phase 2 · **Owner:** Atlas Division
> **Related:** [data-architecture.md](data-architecture.md) · [market-data-model.md](market-data-model.md) · [ADR 0011](../adr/0011-bitemporal-point-in-time-model.md) · [ADR 0005](../adr/0005-point-in-time-and-reproducible-research.md)

---

## 1. Why this is the most important document in Phase 2

Every downstream claim Atlas will ever make rests on one property: **it can reconstruct exactly what it knew at any past moment, and it cannot see the future.** Get this wrong and every backtest is a lie ([failure F-B1](../failure-criteria.md#category-b--integrity--honesty-failures)). This document specifies how Atlas makes **look-ahead bias and survivorship bias structurally impossible at the data layer** rather than matters of discipline.

> **Scope note (honest):** the data layer prevents *data-provenance* leakage (look-ahead, survivorship, silent restatement). The *feature/model* leakage vectors ([ADR 0005](../adr/0005-point-in-time-and-reproducible-research.md)) — a feature peeking past the decision time, fitting a scaler across the train/test split — are prevented by a **leak-proof feature accessor and fold isolation that land in Phase 3**, on top of this foundation. Phase 2 gives you an honest *as-of data* primitive; it does not yet police how features are computed from it.

## 2. Two clocks

| Axis | Question it answers | Example |
|---|---|---|
| **Valid time** (event) | *When is the fact about?* | The 2024-03-15 closing price |
| **Knowledge time** (transaction) | *When did Atlas learn it?* | Ingested 2024-03-16 08:00; corrected 2024-03-18 |

A fact is a point in this 2-D space. "What did we know about 2024-03-15 as of 2024-03-16?" is a query with a coordinate on each axis. Reference implementation: [`atlas.data.bitemporal`](../../src/atlas/data/bitemporal/).

## 3. Append-only versioning

- Each fact has one or more **versions**, each with a knowledge-time interval `[knowledge_from, knowledge_to)`.
- The **current** version has `knowledge_to = FAR_FUTURE` (an explicit `9999-12-31T00:00Z` sentinel — portable and comparable, unlike NULL/`infinity`).
- A **correction inserts a new version and closes the previous one** ([`append_revision`](../../src/atlas/data/bitemporal/asof.py)); the original is never mutated. Corrections cannot be back-dated before what they supersede.

```
knowledge time ──────────────────────────────────────────────▶
close=100   ●━━━━━━━━━━━━━━━━━━━━━━━━━━━╳ (superseded 03-18)
                                        close=101  ●━━━━━━━━━━━━━▶ (current)
              ↑ as-of 03-17 → 100                    ↑ as-of 03-19 → 101
```

## 4. As-of resolution (the anti-look-ahead primitive)

[`resolve_asof(versions, K)`](../../src/atlas/data/bitemporal/asof.py) returns the single version whose interval contains *K*. Two guarantees:

1. **No look-ahead** — a version with `knowledge_from > K` is invisible. You cannot query your way into the future.
2. **No silent overlap** — disjoint knowledge intervals are an invariant; overlap raises `PointInTimeViolation` rather than guessing.

Facts with no version known at *K* are simply **absent** — which is exactly the survivorship-free behaviour (a stock not yet listed, a bar not yet known). Verified by `tests/unit/test_bitemporal.py`.

## 5. Corporate actions: adjust on read, never overwrite

Adjusted prices are **derived**, not stored ([`adjustments`](../../src/atlas/data/adjustments/corporate_actions.py)):

- Raw, unadjusted OHLCV is the immutable source of truth.
- To adjust a bar on date *D* onto a later basis, multiply by the product of price factors of every corporate action with `ex_date > D` **that was known as-of the query's knowledge time**.
- Because adjustment factors change as new actions are announced, an adjusted series is only well-defined *relative to a knowledge time*. Storing adjusted prices would silently restate history — Atlas never does ([ADR 0011](../adr/0011-bitemporal-point-in-time-model.md)). See [market-data-model.md §4](market-data-model.md#4-corporate-actions).

## 6. Survivorship-free universe

Index membership is bitemporal too ([`universe`](../../src/atlas/data/universe/membership.py)). A constituent query is correct on **both** axes at once:

- **valid time** — was the stock actually in the index on that session date?
- **knowledge time** — did we know that as-of the analysis time?

So a 2021 backtest sees the Nifty 50 *as it was in 2021* — including names later removed or delisted — and never a name added afterwards. A reconstitution's restated effective date appends a new version rather than overwriting. Verified by `tests/unit/test_universe.py`.

## 7. Timezone discipline

All timestamps are **timezone-aware**; naive datetimes are rejected at every boundary ([`time_utils.require_aware`](../../src/atlas/common/time_utils.py)) — a whole class of point-in-time bugs comes from silent tz assumptions. Knowledge time is stored/compared in **UTC**; sessions are **IST** (NSE, no DST). A wrong clock silently breaks every PIT guarantee, so clock integrity is an [NFR](../architecture/non-functional-requirements.md#6-reproducibility--determinism).

## 8. The SQL layer must match the reference

The pure [`asof.py`](../../src/atlas/data/bitemporal/asof.py) *defines* correctness; the PostgreSQL implementation ([`OHLCVObservation`](../../src/atlas/data/models/tables.py)) must return identical as-of answers. This equivalence is asserted by `tests/integration/test_persistence_smoke.py`. The `uq_ohlcv_current` partial-unique index enforces "exactly one current version" at the storage layer.

## 9. What this buys the whole system

> Any historical query returns *the world as it was known then* — provably, and testably. That is the Phase-2 exit criterion, and the reason a Phase-3 backtest can be believed.
