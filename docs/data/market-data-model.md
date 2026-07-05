# Atlas — Market Data Model

> **Status:** Ratified · Phase 2 · **Owner:** Atlas Division
> **Related:** [data-architecture.md](data-architecture.md) · [point-in-time.md](point-in-time.md) · [tables.py](../../src/atlas/data/models/tables.py)

---

## 1. Coverage (Phase 2)

NSE cash-segment: **individual equities**, the **Nifty 50 / 100 / 200** indices, and **India VIX**. Data types: OHLCV bars, corporate actions, index membership, and the trading calendar. Frequency: **daily (end-of-day)** to start — the model is frequency-agnostic (event_date generalizes to an intraday timestamp later), consistent with the [non-HFT cadence](../adr/0006-not-high-frequency-trading.md).

## 2. Instruments

[`Instrument`](../../src/atlas/data/market/records.py) / `instruments` table. The stable identity is `instrument_id`, derived from **ISIN** where available (ISIN survives NSE symbol changes; [`ids.instrument_id`](../../src/atlas/common/ids.py)).

| Field | Notes |
|---|---|
| `instrument_id` | stable, ISIN-derived; never changes across symbol renames |
| `isin`, `symbol`, `name` | current identifiers; symbol *history* is tracked bitemporally |
| `instrument_type` | `equity` · `index` · `volatility_index` (India VIX) |
| `listing_date`, `delisting_date` | **delisted instruments are never deleted** — the basis of survivorship-freedom |

India VIX is modeled as an `instrument_type = volatility_index` carrying an OHLC-style series (it has open/high/low/close values), so it flows through the same pipeline and storage as any instrument.

## 3. OHLCV bars

[`OHLCVBar`](../../src/atlas/data/market/records.py) / `ohlcv_observations` (bitemporal, append-only). **Raw and unadjusted** — the immutable source of truth.

- Prices are **`Decimal`** (never float) — exactness is required for reproducibility ([ADR 0014](../adr/0014-reproducibility-and-snapshots.md)).
- Records are **permissive**: economically impossible bars (e.g. `high < low`) are *representable* so the [quality layer](data-quality.md) can detect and quarantine them. Structural facts only (tz, Decimal) are enforced at construction.
- Each stored version carries `source`, `knowledge_from/to`, `revision`, and the `run_id` that loaded it.
- Logical key: `ohlcv:{instrument_id}:{event_date}` — deterministic and source-independent, so vendor swaps don't change identity.

## 4. Corporate actions

[`CorporateAction`](../../src/atlas/data/adjustments/corporate_actions.py) / `corporate_actions` (bitemporal). India-relevant types: **split, bonus, dividend, rights, merger, demerger, face-value change, symbol change, ISIN change, delisting**.

`terms` holds ratios/amounts as **strings** (never floats). Price-adjustment factors ([point-in-time.md §5](point-in-time.md#5-corporate-actions-adjust-on-read-never-overwrite)):

| Action | Factor applied to pre-ex prices |
|---|---|
| Split (old:new) | `old / new` |
| Bonus (held:bonus) | `held / (held + bonus)` |
| Dividend (amount) | `(ref_close − amount) / ref_close` (needs prior close) |
| Symbol/ISIN change, merger, delisting | `1` (no price scaling; handled by symbology/universe) |

Adjustment is **on read**, using only actions known as-of the query — never stored as an overwrite.

## 5. Index membership & universe

[`UniverseLog`](../../src/atlas/data/universe/membership.py) / `index_membership` (bitemporal). Each record: `index_code`, `instrument_id`, valid interval `[valid_from, valid_to)`, and its own knowledge interval. A survivorship-free constituent set for `(index, event_date, known_as_of)` is resolved on both axes ([point-in-time.md §6](point-in-time.md#6-survivorship-free-universe)). Expected sizes (50/100/200) are enforced by the [universe-drift check](data-quality.md).

## 6. Trading calendar

[`TradingCalendar`](../../src/atlas/data/calendars/nse_calendar.py) / `trading_holidays`. A session exists on a weekday that is not an exchange holiday. The calendar is the authority the quality layer uses to distinguish a **gap** (missing session) from a **correct absence** (holiday/weekend). The embedded holiday set is a clearly-labelled **dev seed**; production loads the official NSE list (with provenance and knowledge time). Session hours: 09:15–15:30 IST.

## 7. Data sources

`sources` table records each vendor and its trust `tier`. Capital-affecting data requires **≥2 independent sources** to corroborate ([ADR 0009](../adr/0009-threat-model-and-security-baseline.md)); disagreement beyond tolerance is a halting [quality finding](data-quality.md). Raw vendor payloads are stored hashed for tamper-evidence and reproducibility.

## 8. Lineage

Every bar traces to its `source`, `knowledge_from`, and the `ingestion_run` that loaded it; runs record code version and dependency-lock hash. This is the raw material for the [reproducibility](reproducibility.md) guarantees and end-to-end lineage ([NFR §4](../architecture/non-functional-requirements.md#4-traceability-lineage)).
