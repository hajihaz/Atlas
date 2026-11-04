# Atlas recovery verification and Breaking Money comparison — 4 November 2026

## Scope and acceptance
Continue the approved $0 paper-only system: recover the two carryovers from authentic later books; verify archive, Cron/CPU and six-strategy qualification; inspect the supplied guide/reel and reference implementation. No real orders, paid API, broad OAuth grant, account reset or invented historical fill. Full acceptance still requires an open market session and unattended verified exits.

## Verified cloud evidence
- Existing exit repair 05b22ad was deployed as Worker f58f9837-9ce0-4acb-96fe-0d7364414b51. Public health and private reads returned 200, paper-only, real orders disabled.
- Fresh ledger: EQUITASBNK 102 shares and IDEA 812 shares remain open; cash ₹84,189.70, realized ₹0, two BUY fills. Recovery has not occurred after market close.
- All ten actual 09:40 leaders have 375-minute after-close histories. Eighteen unique symbol-day bodies were independently SHA-256 checked, with 375 consecutive minutes each; fixed sample overlaps are not additional top-ten stocks.
- Ten opening seeds contain 25 bars each; two Nifty opening receipts; daily cohort 10/10 with 85 bars each.
- Live stream: 333 ten-stock receipts from 09:40 through 15:13, missing 14:41 and the required 15:14. Later archive data cannot replace missing point-in-time evidence.
- X journal: 61 evaluated five-minute windows; two explicitly skipped for missing/invalid source. Legacy daybook EXIT=EXECUTED does not certify the independent X account's exits.
- Cloudflare GraphQL window 00:00–17:40 UTC: 1,292 requests, zero invocation errors, all statuses success; maximum returned CPU P99 38,354 microseconds (38.354 ms). This does not certify Free-plan headroom or absence of caught console errors.
- Detailed observability keys API returned 403, code 10104 (no observability access). No new permission or billing change was attempted.

## Recovery hardening
An isolated regression mirroring both position sizes and cash proved new entries were accepted before carryover recovery. The v3 risk policy blocks new intraday entries while an older-session position remains. The regression then queues both recovery intents with no quotes, rejects same-intent and insufficient-depth books, and closes only from later fresh sufficient-depth books. All fixture prices and outcomes are synthetic test data; they never touch cloud balances or count as forward results. Old fills retain their audit policy.

## Six-strategy qualification
| Rule | Fresh evidence | Remaining gate |
|---|---|---|
| ScalpStorm X2 | Ten dated stock histories exist | Same-contract GIFT 06:30/09:30 receipts and conflict policy qualification absent; unarmed |
| ScalpStorm X3 | Ten dated stock histories exist | Point-in-time verified material news and liquidity context absent; unarmed |
| ScalpStorm Xtreme | Current stock histories exist | Twenty prior same-time volume baselines and dated sector-relative returns absent; unarmed |
| VWAP Precision | All ten 4-Nov replays emit retrospective signals | Prospective driver, final risk qualification and unattended entry/exit proof absent; unarmed |
| RSI-2 Snapback | NIFTYBEES has 457 raw daily candles | Adjustment/corporate-action completeness unconfirmed; period route correctly waits; unarmed |
| Dual Momentum Rotation | Both ETFs have 457 raw candles each | Time-qualified adjusted series and period-rule validation absent; unarmed |

X replay: nine retrospective signals and one no-trade. X2/X3/Xtreme each return ten WAITING_REQUIRED_CONTEXT outcomes. ETF source status is RAW_UNADJUSTED_ACTIONS_API_ZERO_EVENTS_UNCONFIRMED. No retrospective result was inserted as a forward fill.

## Reference inspection
Sources: supplied nine-page Drive guide (file 1zF7grzcal2Kx-KeCda9rmG5vBbmYdWFJ), Instagram reel De11AMGyE5j caption/player, and public repository https://github.com/akshaymshankar/Breaking_Money_Trading-Agent at 22ff0064b2f5154491f0455a80bd4b9890691f63. The complete audio was not transcribed. Source was cloned for static review only; no installer or paid AI mode was run.

The local Python app combines pandas/numpy indicators, yfinance or direct read-only Upstox HTTP, Claude CLI/API or deterministic rules, a deterministic simulator, SQLite and an HTML report. Default polling is 30 seconds, decisions every 15 minutes, fixed ten-stock watchlist, long-only, 15-session challenge. The published source contains no external MCP/plugin orchestration matching the caption's broader claim.

Useful patterns: explicit active decision engine, versioned locked experiment settings, detailed charge breakdown, decision-to-order journal, benchmark/leaderboard and per-exit analytics. Atlas's current cloud ledger instead uses a simplified 10-bps-per-side fee model; do not call that an exact Indian broker/tax breakdown.

Do not copy weaker execution assumptions: the reference Upstox adapter stamps ts=now_ist rather than retaining provider trade time, approximates bar volume as daily volume/75, and closes full positions at modeled prices without order-book depth. These can make exits appear easier than Atlas's stricter observed-book model. No evidence in the reference source removes Atlas's missing GIFT/news/adjustment requirements or proves strategy profitability.

## Resume
Next open regular session is 5 November per official NSE calendar. Verify two actual recovery fills, zero carryovers/pending intents and reconciled cash; inspect fresh minute continuity and Free CPU; obtain narrowly scoped observability access if detailed logs remain unavailable. Preserve formal end-to-end certification at 0/100 until existing acceptance milestones pass. Raw evidence is under the main repository .ai/evidence/work-*20261104* and work-*. No new AI billing or live orders.
