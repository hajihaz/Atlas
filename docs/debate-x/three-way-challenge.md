# Atlas Debate X — Three-Way 15-Session Paper Challenge

**Implementation:** research-only extension built on Atlas Debate X. Inspired by the
MIT-licensed [Breaking Money AI Trading Arena](https://github.com/akshaymshankar/Breaking_Money_Trading-Agent),
but independently implemented. The old two-book replay CLI still works; nothing in
`main`, ScalpStorm, production, or brokerage order routing is replaced.

## Three comparison portfolios

| Virtual portfolio | Rules | Starting capital |
| --- | --- | --- |
| Original Atlas | The **already proposed** Atlas BUY candidate, subject to Atlas RiskGate | ₹1,00,000 |
| Rules baseline | Independent, deterministic SMA9/SMA21, RSI14, VWAP, volume ratio, 30m momentum filter | ₹1,00,000 |
| Debate X | Bull + Bear + Judge citations, only valid REVIEWED APPROVE, RiskGate veto | ₹1,00,000 |

Each hypothetical serial intraday entry has a ₹10,000 budget, one common **post-decision**
quote, and the same exit observation and execution-cost model. **No actual orders** are
placed, and a single prompt does not have permission to execute a BUY or SELL.

## Input: source-attested, time-aware paper case

`--three-way` expects a JSON file of this shape:

```json
{
  "holidays": [],
  "close_sessions": ["2026-11-05"],
  "cases": [{
    "candidate": {
      "schema": 1,
      "mode": "POINT_IN_TIME_PAPER_REPLAY",
      "live_orders_enabled": false,
      "id": "example-001",
      "symbol": "RELIANCE",
      "strategy_id": "scalpstorm_x",
      "snapshot_id": "private-snapshot-id",
      "decision_at": "2026-11-05T09:40:00+05:30",
      "baseline_intent": "BUY",
      "entry_price_inr": "1000",
      "quote_evidence_id": "q1",
      "evidence": [
        {
          "id": "q1",
          "kind": "quote",
          "source": "approved-provider-name",
          "published_at": "2026-11-05T09:39:45+05:30",
          "received_at": "2026-11-05T09:39:46+05:30",
          "price_inr": "1000",
          "detail": "At-the-time recorded example price, NOT a factual historical NSE observation"
        }
      ],
      "indicators": {
        "source": "approved-completed-candle-source",
        "as_of": "2026-11-05T09:39:45+05:30",
        "received_at": "2026-11-05T09:39:46+05:30",
        "sma9": "1005",
        "sma21": "990",
        "vwap": "995",
        "rsi14": "61",
        "volume_ratio": "1.5",
        "momentum_30m_pct": "0.4"
      }
    },
    "execution": {
      "decision_completed_at": "2026-11-05T09:40:12+05:30",
      "entry_quote": {
        "market": "NSE",
        "source": "approved-provider-name",
        "observed_at": "2026-11-05T09:40:22+05:30",
        "received_at": "2026-11-05T09:40:24+05:30",
        "price_inr": "1000.5",
        "bar_volume": "100000"
      },
      "exit_quote": {
        "market": "NSE",
        "source": "approved-provider-name",
        "observed_at": "2026-11-05T15:14:57+05:30",
        "received_at": "2026-11-05T15:15:00+05:30",
        "price_inr": "1010",
        "bar_volume": "95000"
      }
    }
  }]
}
```

**The prices in this example are fictional data used to illustrate the contract.**
Do not pass a real historical trade outcome as an input into an AI decision.
`execution` is only read by the independent simulation AFTER the Bull/Bear/Judge
call completes. The implementation does not verify whether externally asserted
timestamps, trading-volume observations, market entitlements or API response records
are authentic. A source integration needs permission, provenance and archive support.

### Rules comparator (not AI)

At the same decision-time evidence:
- SMA9 strictly exceeds SMA21; last proposed signal price strictly exceeds VWAP
- RSI14 within 52–68 inclusive
- 30-minute price momentum greater than 0.15%
- Bar-volume ratio at least 1.2x
- Indicator timestamps are explicit and recent (≤90 seconds)

Missing/invalid/stale indicators => the **rules comparator skips**. It never
fakes a decision or uses the original AI opinion. These are experiment-only rules,
not a change to ScalpStorm X, X2 or X3.

### Paper execution safeguards

- Decision-time quote is source-attributed and age ≤90 seconds.
- Entry price is **re-quoted after decision completion**. Entry observation
  must be after completion, within 180 seconds of the original candidate.
- Exit observation is after the entry, in the **same Indian trading session**
  before 15:30 IST. Exchange observation receipt freshness ≤90 seconds.
- Entries from 09:15 to 14:45 IST, never weekends or explicitly supplied
  market holidays; same source required for entry and exit.
- Spread, adverse slippage, size impact, 5% of per-bar volume, ₹0.05
  price ticks, cash checks, per-side brokerage, STT, stamp, GST, exchange
  and SEBI charges are modeled.
- Costs are **illustrative configuration, not a certified current statutory
  rate sheet**; validate the selected broker and trade tax rules before analysis.
- Atlas RiskGate enforces a deterministic position veto. The replay also
  prevents further hypothetical entries after a 3% per-book daily drawdown.
- Only **serial non-overlapping long positions**, settled on observed
  timestamps. This is **not** a full simultaneous-position broker simulator.

### Running the challenge — no LLM required

```bash
PYTHONPATH=src python3.11 -m atlas.debate_x.cli \
  --three-way \
  --state /path/to/private/debate-x-challenge.sqlite3 \
  --input /path/to/private/cases.json \
  --output /path/to/private/debate-x-report.json
```

No LLM calls are made by default. In that mode the baseline and independent
rules comparator can be evaluated; the AI decision stays `NOT_CONNECTED` and
**no valid AI performance claim is produced**.

If API usage is separately authorized and budgeted, add `--enable-llm` and
explicitly configure `ATLAS_DEBATE_ENABLED=1`, `ATLAS_DEBATE_PROVIDER`,
`ATLAS_DEBATE_MODEL` and the matching `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`
in your private runtime environment. The app never reads your key in its browser.

### Resume and end-of-day

The `--state` SQLite file holds immutable source-input hashes, review
arguments, book balances, fee detail and a SHA-256 chained local journal. A
second run with the **same input** resumes without making additional model
calls. Changed/retroactively inserted evidence for an existing candidate is
rejected; start a new experiment instead.

The input `close_sessions` is an ordered list of dates to mark as **explicitly
completed** after their candidates are replayed. The runner counts *only*
explicitly finalized, eligible NSE trading sessions (never 15 calendar days).
The trial stops after 15 completed sessions. Missing market days and holidays
are not silently counted as successful sessions.

For a whole 15-session input file, keep all cases in decision-time order and
supply the corresponding dates in `close_sessions`. Multiple cases may occur
within a date, but serial non-overlap is required. The runner accepts at most
200 cases per import and up to 1,500 recorded cases per 15-session challenge;
the dashboard lists the latest 100 matching decisions while retaining all
1,500 in the imported report. Large imports are bounded to 16 MB.

### Dashboard

Atlas > Debate X initially shows an honest, empty three-way dashboard with
zero observed trades, no invented P&L, and 0/15 completed days. You can import
a private local JSON report. Provisional rules and baseline curves are
separated from **fully reviewed** Bull/Bear/Judge AI curves. Reports may carry
sensitive evidence and should not be published to the public Vercel preview.

### Owner gates

1. A **rights-cleared source** for timely NSE prices, recorded
   market observations, completed candles, and corporate events.
2. A **deliberately configured model**, with a budget approved for API usage
   if applicable. Claude Code CLI is not assumed installed or entitled.
3. A genuine **15-session forward shadow evaluation**, then comparative
   net P&L/drawdown/fees review and an explicit acceptance before activation.

This experiment does not imply profitability or place live orders.
