# Atlas — Development Foundation

> **Status:** Ratified · Phase 2 · **Owner:** Atlas Division
> **Related:** [ADR 0010](../adr/0010-phase-2-technology-stack.md) · [data-architecture.md](../data/data-architecture.md) · [../../CLAUDE.md](../../CLAUDE.md)

---

## 1. Repository structure

```
Atlas/
├── src/atlas/                 # the package (src-layout)
│   ├── common/                # pure spine: time, hashing, ids, types, errors
│   ├── data/
│   │   ├── bitemporal/        # as-of / point-in-time core (pure)
│   │   ├── market/            # instrument & OHLCV records (pure)
│   │   ├── calendars/         # NSE trading calendar (pure)
│   │   ├── adjustments/       # corporate actions (pure)
│   │   ├── universe/          # survivorship-free membership (pure)
│   │   ├── quality/           # validation framework + checks (pure)
│   │   ├── snapshots/         # content-addressed snapshots (pure)
│   │   ├── lineage/           # provenance (pure)
│   │   ├── ingestion/         # adapters + pipeline (adapters need deps)
│   │   └── models/            # SQLAlchemy schema (adapter)
│   ├── trials/                # hash-chained trial ledger (pure + store)
│   ├── config/                # pydantic settings (adapter)
│   └── cli/                   # Typer CLI (adapter)
├── database/migrations/       # Alembic
├── tests/{unit,integration,reproducibility}/
├── docs/{data,research,development,architecture,adr}/
├── pyproject.toml · Makefile · .pre-commit-config.yaml · .github/workflows/ci.yml
└── (reserved, empty until their phase) strategies/ backtests/ reports/ frontend/ backend/
```

**src-layout** is used deliberately (imports resolve to the installed package, not the working dir — fewer import surprises). The **pure core / adapter split** is the organizing rule ([ADR 0010](../adr/0010-phase-2-technology-stack.md)): everything marked *(pure)* imports zero third-party packages. The reserved top-level directories stay empty until their [roadmap](../roadmap.md) phase.

## 2. Technology decisions (summary — full rationale in [ADR 0010](../adr/0010-phase-2-technology-stack.md))

| Concern | Choice |
|---|---|
| Language | Python 3.12 (core also runs on 3.9) |
| Database | PostgreSQL 16 (+ optional TimescaleDB later) |
| ORM / migrations | SQLAlchemy 2.0 / Alembic |
| Bulk & snapshot storage | Object storage + Parquet |
| Packaging | `uv` + hash-locked `uv.lock` |
| Lint / format / types | `ruff` / `ruff format` / `mypy --strict` |
| Tests | `pytest` (+ `hypothesis`); core also via stdlib `unittest` |
| Security | `pip-audit`, `detect-secrets` |
| Interface | Typer CLI now; FastAPI deferred (no API in Phase 2) |
| CI/CD | GitHub Actions |

## 3. Testing strategy

| Layer | What it proves | Runs where |
|---|---|---|
| **Unit** (`tests/unit`) | pure-core logic: PIT/as-of, quality, calendar, corporate actions, universe, ledger, snapshots | anywhere — **bare Python, no deps** |
| **Reproducibility** (`tests/reproducibility`) | vendor-swap equivalence; snapshot re-materialization | bare Python |
| **Integration** (`tests/integration`) | the SQL layer matches the pure bitemporal reference | needs Postgres (`ATLAS_TEST_DB`); skips otherwise |

Principles: **the pure reference semantics define correctness and the SQL layer must match them**; **point-in-time and quality invariants are tested adversarially** (no look-ahead, tamper detection, fail-safe halt); coverage gate ≥ 85%. Run: `make core-test` (no deps) or `make test` (full).

### Backtesting-validation standards (forward pledge)
Phase 3 backtests must: pin a `snapshot_id`; record `(strategy_version × snapshot × params × seed)` to the [trial ledger](../research/trial-ledger.md); reproduce bit-for-bit; and consume the family-level trial count for multiplicity correction. Phase 2 provides the primitives; Phase 3 enforces the standard.

## 4. Development workflow

- **Branch per change**, PR into `main`; CI must be green (lint, types, tests, audit, secret scan).
- **ADR-driven**: any architecturally significant decision gets an [ADR](../adr/0001-record-architecture-decisions.md) ([CLAUDE.md](../../CLAUDE.md) rules).
- **pre-commit** runs ruff, secret detection, and blocks `.env` — install with `pre-commit install`.
- **Migrations**: change models → `alembic revision --autogenerate` → review → `alembic upgrade head`. The initial schema is hand-written and reviewed ([0001_initial](../../database/migrations/versions/0001_initial_schema.py)).
- **Never commit secrets or bulk data** (`.gitignore` enforces; data is reproducible, not source).

## 5. CI/CD

[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml):

- **`core-no-deps`** — runs the pure core on bare Python **3.9 and 3.12**. This job failing means a third-party import leaked into the core; it is the guardrail for the pure/adapter split.
- **`full`** — `uv sync --locked` (supply-chain), ruff, `mypy`, `alembic upgrade`, `pytest --cov`, `pip-audit`, `detect-secrets`, against a Postgres service.

No deployment stage exists — there is nothing to deploy in Phase 2 (no service, no live capital).

## 6. Security alignment

Every choice honours the [threat model](../architecture/threat-model.md): hash-locked deps + `pip-audit` (supply-chain `[MUST]`), secrets only via env + `detect-secrets`, least-privilege DB roles, tz-aware enforcement, append-only/hash-chained integrity. No broker credentials exist — Atlas has no execution capability until Phase 7.
