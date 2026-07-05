# Atlas — Trial Ledger

> **Status:** Ratified · Phase 2 · **Owner:** Atlas Division
> **Related:** [ADR 0012](../adr/0012-trial-ledger.md) · [ADR 0005](../adr/0005-point-in-time-and-reproducible-research.md) · [ledger.py](../../src/atlas/trials/ledger.py) · [../data/reproducibility.md](../data/reproducibility.md)

---

## 1. Why a ledger exists before any strategy does

Overfitting is the default outcome of naive backtesting, and its correction (deflated Sharpe, probability-of-backtest-overfitting) is only meaningful against the **total number of trials across the whole research program** — the multiplicity denominator ([ADR 0005](../adr/0005-point-in-time-and-reproducible-research.md)). If Atlas cannot count how many ideas it tried, its statistical defenses are decorative and it will deploy overfit strategies ([F-C6](../failure-criteria.md#category-c--process--discipline-failures)). Strategies arrive in Phase 3+, but the ledger they must write to is a Phase-2 foundation, so there is no "we'll add it later" gap.

## 2. What the ledger records

Every **trial** — every parameter set, optimization attempt, and AI-proposed candidate — is recorded ([`TrialRecord`](../../src/atlas/trials/ledger.py)):

| Field | Purpose |
|---|---|
| `trial_id`, `family_id` | identity; the *family* groups related experiments for multiplicity |
| `status` | proposed → running → completed/failed → rejected/promoted → archived |
| `spec` | strategy family, params, config |
| `data_snapshot_id`, `seed`, `code_version` | reproducibility ([reproducibility.md](../data/reproducibility.md)) |
| `metrics`, `verdict`, `note` | outcome and rationale |
| `recorded_at` | tz-aware knowledge time |

A trial's evolution is a **sequence of append-only records** (a status change appends a new record for the same `trial_id`); nothing is mutated in place.

## 3. Tamper-evidence (hash chain)

The ledger is **append-only and hash-chained** ([ADR 0009](../adr/0009-threat-model-and-security-baseline.md)): each entry stores `record_hash`, `prev_hash`, and `chain_hash = H(prev_hash : record_hash)`. Any later **in-place edit** to an earlier record changes its `record_hash` and breaks every subsequent link; [`verify_integrity()`](../../src/atlas/trials/ledger.py) raises `LedgerIntegrityError`.

**Honest limit (and its fix):** self-verification does **not**, on its own, catch *truncation* (dropping the last N entries — e.g. the losing siblings that inflate a survivor's Sharpe) or a full *re-chain from genesis*, because both produce a chain that self-verifies. Catching those requires pinning the head to an **external witness the writer cannot rewrite**: `head_checkpoint()` returns `(seq, chain_hash)` to publish to an append-only/WORM store, and `verify_integrity(checkpoint=…)` then fails on truncation or divergence. External anchoring is a **Phase-7 entry-gate requirement** (no live capital until then). The dev JSONL store is append-only *by contract* (0600 perms, flock-serialized appends); the production Postgres table is made truly append-only by DB triggers ([migration 0002](../../database/migrations/versions/0002_integrity_hardening.py)). Verified — including tampering *and* truncation-vs-checkpoint — by `tests/unit/test_trial_ledger.py` and `tests/unit/test_hardening.py`.

## 4. The questions it answers

[`summary()`](../../src/atlas/trials/ledger.py) reports, from one auditable log: how many ideas were **tested** (distinct trials), how many **failed**, how many were **rejected**, how many **completed** (survived), and how many were **promoted** (reached production). [`family_trial_count(family)`](../../src/atlas/trials/ledger.py) is the multiplicity denominator the overfitting correction consumes.

## 5. Storage

Behind a `LedgerStore` protocol ([store.py](../../src/atlas/trials/store.py)): an in-memory reference (tests), a **JSONL** append-only file (dev/local), and a Postgres append-only `trial_ledger` table (production) — all satisfying identical semantics. The JSONL store is intentionally simple and human-inspectable; the CLI (`atlas trial summary <path>`) verifies integrity and prints the summary.

## 6. How Phase 3 wires in

Phase 3's experiment runner will write to the ledger **automatically** on every trial — not left to human diligence — so the trial count is complete and the multiplicity correction honest. The ledger is the bridge between "we ran an experiment" and "we can trust the evidence."
