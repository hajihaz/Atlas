# Atlas six-role research council — implementation and rollout
Date: 2026-10-20
Owner: Atlas operator
Status: Stage 1 candidate, subsequent stages pending validation
Related: [Trading charter](../automated-trading-charter.md), [data architecture](../data/data-architecture.md), [existing strategy workbench](atlas-zero-cost-strategy-lab-2026-10-19.md)

## Finite approved objective
Integrate a source-backed six-role *advisory* council into Atlas, then deliver a verifiable zero-cost-first market intelligence, strategy testing, continuous virtual paper trading and ChatGPT reporting system. Finish when each stage is either verified and accepted or documented as an external owner gate. Never describe six role cards as six connected/trained Grok bots.

## Non-negotiable constraints
- No real orders, broker execution, subscriptions, hosting upgrades or live production financial data modification.
- No forged quotes, returns, sentiment, headlines, positions or fills.
- Licensed or explicitly permitted providers only; no NSE chart scraping or circumvention of data access.
- Risk may veto; an AI cannot authorize capital; all execution stays virtual.
- Preserve source chronology, point-in-time fidelity, independent audit and unrelated changes.

## Milestones and acceptance criteria
1. **Evidence council prototype** (this change). Six explainable Scout, News, Sentiment, Charts, Risk, Decision cards on the existing strategy research pages. Scout and Charts read authenticated-as-to-source (not brokerage authenticated) public historical research results. News/Sentiment remain NOT CONNECTED until actually implemented. Risk screens historical model drawdown >5% as a research heuristic only. Decision is WAIT or SKIP, never an order. Test bogus timestamps, missing data, risk veto, unknown strategies and no BUY. Mobile responsive. CI green, reviewed merge and deployed Vercel.
2. **Adapters and data validation.** Keep existing CoinDCX historical/stream adapter. Evaluate properly permitted, free news feeds with publication and ingest timestamps, deduplication and symbol-level source attribution. Evaluate sentiment only when valid source access and coverage are available; lack of social data is a real unavailable state, not neutral fabricated sentiment. Authenticated NSE broker-market feed requires owner-controlled login and permitted data rights. Verify feed availability, rate limit, staleness, missing bars, outage fallback and license.
3. **Strategy framework.** Retain five historical INR crypto strategies; add strategy registry/versioning, snapshot hashes, walk-forward testing, fees/slippage sensitivity, and strict train/test separation. ScalpStorm X NSE top-volume remains pending adequate point-in-time stock data. Assess TradingAgents, NautilusTrader, Qlib and FinRL after license, security, dependency and fit audits, not bulk-clone.
4. **Durable paper trading.** Migrate optional trials from browser-only localStorage to a server-held, replay-safe, append-only virtual ledger. Keep model fills separate from broker-confirmed fills. A 24/7 runtime needs a scheduler/worker whose no-cost quotas are verified and which handles downtime, exchange sessions, missed data, deduplication and halts without backfilling invented trades.
5. **Atlas UI.** Mobile-first agent council, live verified charts and connection age, strategy selection, per-day drilldown, equity/drawdown/cost graphs, side-by-side strategy comparison, transparent zero results and source/assumption badges. Preserve source-unavailable states.
6. **ChatGPT.** Expose the same read-only evidence behind authorized actions, then render comparisons, daily and monthly summaries, and per-strategy breakdown in chat. No hidden direct order action. Verify dashboard and ChatGPT report reconciliation with identical ledger hashes.

## Owner gates
Authenticated NSE broker data may require the owner's sign-in/2FA and provider terms; commercial news/social feeds may require permitted access; persistent background services may require hosting availability or a paid tier (stop rather than pay); live-capital authority remains outside this objective.

## Stage 1 acceptance evidence
Tests at frontend/tests/council-engine.test.mjs; existing CI .github/workflows/atlas-ui.yml; PR and deployment artifacts. A passed Stage 1 does not certify market profitability, a connected news or social feed, live NSE data or 24/7 service.
