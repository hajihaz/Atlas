# Atlas Debate X — paper-only adversarial research (v1)

Status: implemented in the isolated `feat/atlas-debate-x-20261107` feature branch. **Not a certified
real-time NSE trading system.** The baseline production strategy execution path is unchanged.

## Objective and non-negotiable boundaries

- Independent **Bull**, **Bear**, **Judge** roles. Bull and Bear receive exactly the same point-in-time
  evidence concurrently; Judge receives both validated arguments and the original packet.
- LLM provider is **disabled by default**; never represent a six-role deterministic council as real AI.
- All evidence needs explicit publication and receipt timestamps at/before `decision_at`.
  Quote receipts more than 90 seconds before a signal are rejected. No retrospective news leakage.
- No broker adapter, trading credentials, real-order endpoint, leverage or live-capital authorization exists
  in this module. Judge recommendations do not bypass `atlas.risk.gate.RiskGate`.
- Invalid data, invalid model JSON, nonexistent evidence citation, stale price, absent credentials, API errors,
  or risk veto => **SKIP**. No synthetic BUY or claimed profitability.
- This branch only provides an isolated comparison/report dashboard and local replay executor.
  No automatic NSE stock-universe selection, broker orders, or live data feed are connected.

## New: three-way persistent 15-session challenge

Breaking Money-style inspiration has been implemented independently for three
virtual books: original Atlas signal, deterministic SMA/RSI/VWAP rules,
and the Bull/Bear/Judge filter. The new opt-in CLI supports independently
post-decision re-quoted NSE observations, illustrative Indian charges,
local SQLite resume, daily 3% loss checks and explicit 15-session counting.

See [Three-Way Challenge](three-way-challenge.md) for input contract, CLI,
fees, source/certification limits and examples. The old two-book replay
remains available unchanged. No model or market-data provider is
connected automatically.

## Components

| Path | Responsibility |
| --- | --- |
| `src/atlas/debate_x/evidence.py` | Immutable candidate/evidence schema and leakage/freshness gate |
| `src/atlas/debate_x/engine.py` | Parallel independent Bull/Bear → Judge; citations, validation, hard risk veto |
| `src/atlas/debate_x/providers.py` | Opt-in official OpenAI/Anthropic HTTPS adapters; bounded requests/no redirects |
| `src/atlas/debate_x/shadow.py` | Separate virtual ₹100,000 books; ₹10,000 per closed trade, hash-chained journal |
| `src/atlas/debate_x/cli.py` | Offline packet ingestion and JSON report export; no broker endpoints |
| `frontend/src/components/DebateXPage.tsx` | Read-only equity comparison, arguments, audit trail, mobile layout |
| `frontend/public/debate-x-report.json` | **Empty, truthful** shipped result; not demo returns |

The original six-role Council remains an independent deterministic research view.
Debate X does not silently change the current 9:40 AM ScalpStorm decisions.

## Evidence input contract

The local CLI accepts `{"cases":[{"candidate":{...},"closed":{...}}, ...]}`.
The **candidate** object must contain:

- `schema:1`, `mode:"POINT_IN_TIME_PAPER_REPLAY"`, `live_orders_enabled:false`
- `id`, `snapshot_id`, `symbol` (e.g. an allowed NSE ticker), `strategy_id`
- `decision_at` with a UTC offset, `baseline_intent:"BUY"`, `entry_price_inr`
- `quote_evidence_id` and `evidence` array, with 1–32 records of `id,kind,source,
  published_at,received_at,detail`, and `price_inr` on the quote record.

The price source must carry a timestamp within 90 seconds of the decision and
its `price_inr` must numerically match `candidate.entry_price_inr`. The module **does not**
verify market-data vendor rights or digitally attest the source; an authorized upstream market-data
adapter must provide trustworthy snapshot identifiers and timestamps.

Only after a debate decision, the CLI accepts the **closed** record:
`candidate_id`, `exit_at` strictly after decision, `exit_price_inr`, and `source`.
Exit outcomes are never passed into the LLM prompt.

All replay cases must be chronological. Overlapping positions are deliberately unsupported
by this **serial completed-trade research replay**, so it must not be misrepresented as a full
portfolio simulator or as forward trading results.

## Run offline without an LLM (safe connectivity test)

```bash
PYTHONPATH=src python3.11 -m atlas.debate_x.cli \
  --input /absolute/path/to/attributed-cases.json \
  --output /tmp/debate-x-report.json
```

A run without a configured LLM yields `NOT_CONNECTED` reviews and
`comparison_valid: false`. This is expected; it must not create fake agent output.
Only actual closed observations are settled against the independent virtual books.

## Explicitly enable a model (API charges may apply)

This is an **opt-in** local process; do not embed model keys in browser JavaScript or commits.
Select exactly one provider:

```bash
export ATLAS_DEBATE_ENABLED=1
export ATLAS_DEBATE_PROVIDER=openai
export ATLAS_DEBATE_MODEL=<your-supported-chat-completions-model>
export OPENAI_API_KEY=<from-your-secret-manager>
PYTHONPATH=src python3.11 -m atlas.debate_x.cli \
  --enable-llm --input /absolute/path/to/attributed-cases.json \
  --output /tmp/debate-x-report.json
```

Or use `ATLAS_DEBATE_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` and an
Anthropic Messages API model. Each signal makes up to **3 model calls** (Bull/Bear + Judge);
the model's structured JSON fields are validated. The API may have cost and latency.
No LLM call is made absent both `--enable-llm` and `ATLAS_DEBATE_ENABLED=1`.

`frontend/src/components/DebateXPage.tsx` can inspect a resulting report using the
**Import local report** picker, without uploading the file. A public/bundled report must be
published only after verifying its source rights, privacy and audit provenance. Do not commit
raw private broker metadata or automatically publish API arguments to the public Vercel page.

## Comparison metrics, not promises

The baseline book follows the supplied approved long signal, subject to its own RiskGate.
The filtered book follows only a cited, risk-approved Judge APPROVE recommendation.
Each book starts with ₹100,000; each hypothetical entry is capped at ₹10,000.
Default modeled fee+slippage is 0.15% **per side**, configurable for sensitivity tests.
Trade settlement is after both independent opinions; every row includes a SHA-256 hash link.

Track baseline vs filtered closing equity, max drawdown, agent coverage, rejected winning
candidates, costs, and errors. A replay is comparable only if all processed cases have
successfully reviewed LLM arguments. The method is **not** a statistical performance
certification, and no paper-forward result is claimed.

## Tests and acceptance

```bash
PYTHONPATH=src python3.11 -m pytest -q tests/unit/test_debate_x.py
python3.11 -m ruff check src/atlas/debate_x tests/unit/test_debate_x.py
cd frontend && node --test tests/*.test.mjs && npm run check && npm run build
```

Before enabling a real forward paper filter: obtain an authorized timestamped NSE data source,
provide signed/attested as-of evidence and a consistent closed-trade ledger, benchmark Atlas
original/rule-filter/AI-filter on the **same sessions**, evaluate slippage, costs and latency,
and require separate promotion approval. Until then, the legacy baseline is not altered.
