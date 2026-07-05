# ADR 0010 — Phase 2 Technology Stack

> **Status:** Accepted
> **Date:** 2026-07-05
> **Deciders:** Atlas Division (Phase 2)
> **Phase:** 2 (Data Foundation & Research Infrastructure)

---

## Context

Phase 2 introduces the first Atlas code. The stack must serve a **10-year, correctness-first, research-heavy, non-HFT** system ([ADR 0006](0006-not-high-frequency-trading.md)) that values auditability, reproducibility, and replaceability over raw speed ([principles](../principles.md)). It must also honour the pure-vs-adapter separation implied by [ADR 0002](0002-layered-architecture-and-separation-of-duties.md): the domain must not be hostage to any single library.

## Decision

**Language — Python 3.12** (production; 3.11 minimum). Dominant in quantitative research and data engineering; the backtesting/analytics phases will lean on its ecosystem. The domain **core** is written to also run on 3.9 stdlib, and CI proves it ([§ pure-core / adapter split](#the-pure-core--adapter-split)).

**Database — PostgreSQL 16.** Boring, ACID, battle-tested, and 10-year-safe. Rich enough for the bitemporal design (range/partial-unique indexes, partitioning, exclusion constraints) without exotic dependencies. Time-series scale at NSE cardinality (a few thousand instruments × daily bars) is comfortable; TimescaleDB is an *optional* future extension behind the same schema, not a Phase-2 commitment.

**ORM & migrations — SQLAlchemy 2.0 + Alembic.** Mature, typed, supports raw SQL escape hatches, and keeps schema evolution reviewable. Driver: `psycopg` v3.

**Object storage + Parquet** for immutable snapshots, raw vendor payloads, and cold tiers — local filesystem in dev, S3-compatible in prod, behind an abstraction. Columnar Parquet suits reproducible historical datasets and cheap retention ([NFR §8](../architecture/non-functional-requirements.md#8-data-retention)).

**Packaging — `uv`** with `pyproject.toml` (PEP 621) and a **hash-locked** `uv.lock`. Fast, reproducible, and its hash-pinning directly serves the supply-chain `[MUST]` ([ADR 0009](0009-threat-model-and-security-baseline.md)).

**Testing — `pytest`** (+ `hypothesis` for invariants, `pytest-cov`). The pure core is *also* runnable via stdlib `unittest`, so it can be verified with zero third-party packages.

**Quality gates — `ruff`** (lint+format, incl. flake8-bandit security and flake8-datetimez to enforce tz-aware datetimes) and **`mypy --strict`**. **`pip-audit`** and **`detect-secrets`** enforce supply-chain and secret hygiene.

**Interface — Typer CLI** now; **FastAPI is chosen for future internal services but no API is stood up in Phase 2** (no dashboards/APIs — out of scope). Structured logging via `structlog`.

**CI/CD — GitHub Actions.** A `core-no-deps` job runs the pure core on bare Python (3.9 + 3.12); a `full` job runs lint, type, migrate, test+coverage, audit, and secret-scan against a Postgres service. No deployment (nothing to deploy yet).

**Repository — `src/` layout**, documented in [development-foundation.md](../development/development-foundation.md).

### The pure-core / adapter split

The load-bearing architectural decision: the **domain core** (`atlas.common`, `atlas.data.bitemporal/quality/calendars/adjustments/universe/snapshots/lineage`, `atlas.trials`) imports **zero third-party packages**. SQLAlchemy, Pydantic, pandas, Typer live only in *adapter* layers (`atlas.data.models`, `atlas.data.ingestion.adapters`, `atlas.config`, `atlas.cli`). This makes the core trivially testable, reproducible, portable, and immune to any single dependency's churn over a decade — a direct expression of [principle 2.9](../principles.md#29-loose-coupling-and-replaceability).

## Consequences

### Positive
- Conventional, hire-able, well-supported stack with a decade of runway.
- The pure core is verifiable without a build; supply-chain risk is concentrated in adapters.
- Reproducibility and auditability are served by the exact choices (Decimal, Parquet, hash-locked deps, tz-aware enforcement).

### Negative / costs
- Python is not the fastest language — acceptable, Atlas is [not HFT](0006-not-high-frequency-trading.md).
- Two "ways to run tests" (pytest and unittest-core) is mild duplication — justified by the zero-dep guarantee it buys.

### Mitigations
- Performance-critical paths (later phases) can drop to vectorized libraries or extensions behind interfaces; nothing here precludes it.

## Alternatives considered
- **DuckDB / Parquet-only (no Postgres).** Rejected as the *system of record*: Atlas needs concurrent writes, constraints, roles, and append-only guarantees. DuckDB is a great *analytics/read* engine and may be adopted later for snapshot querying.
- **Poetry / pip-tools** instead of uv. Reasonable; uv chosen for speed and first-class hash-locking.
- **Django ORM / raw SQL.** Rejected: Django is too heavy for a non-web data core; raw SQL alone loses typing and migration tooling.
- **Rust/Go core.** Rejected for Phase 2: research ergonomics and ecosystem favour Python; the pure-core boundary means a hot path could be re-implemented later without touching the domain.

## Principles upheld / traded
Upholds [2.9 loose coupling](../principles.md#29-loose-coupling-and-replaceability), [2.10 simplicity over cleverness](../principles.md#210-simplicity-and-robustness-over-cleverness), [2.2 reproducibility](../principles.md#22-reproducibility-and-determinism). Trades peak performance for correctness, auditability, and longevity — the standing Atlas bargain.

## Related
[development-foundation.md](../development/development-foundation.md) · [data-architecture.md](../data/data-architecture.md) · [ADR 0009](0009-threat-model-and-security-baseline.md)
