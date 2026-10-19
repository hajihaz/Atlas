# Atlas six-role trading research council and unattended paper-trading roadmap

- **Status:** First delivery implemented on feature branch; unattended automated paper execution is *not* part of this release.
- **Date:** 2026-10-20
- **Owner:** Atlas
- **Scope:** ₹0-first research and virtual execution; *no real-capital orders, broker keys, paid subscriptions or permission escalation*.
- **Related:** [Automated Trading Charter](../automated-trading-charter.md), [Governance](../principles.md), [Zero-cost Strategy Lab](atlas-zero-cost-strategy-lab-2026-10-19.md).

## Finite objective

Evolve the existing Atlas public-market observer and local strategy simulations into an evidence-based six-role trading research and durable paper-trading platform. Preserve independent veto and never display backtested results as earned profit.

## Reality check

The screenshot depicting six Grok trading bots and large returns is not an audited proof of profitability. The council shipped here is **six deterministic, explicitly labeled research roles**. It is NOT six independent LLM models, a trading consensus, a real-time BUY engine or a live paper execution engine. Invalid/missing inputs lead to SKIP; valid historical replays with acceptable model drawdown lead to WAIT for missing contemporaneous evidence. Neither routes orders.

## Six responsibility boundaries

| Role | Trusted inputs | Output | Fail closed |
| --- | --- | --- | --- |
| 1. Scout | Timestamped, allowlisted market observations, universe | Candidate and source snapshot | Empty when unverified |
| 2. News | Dated primary/corroborated events with citations | Named catalyst + timestamp | NOT CONNECTED until reliable |
| 3. Sentiment | Attributed, licensed text and de-duplicated author sampling | Measured mood, confidence and hype detection | NOT CONNECTED until reliable |
| 4. Charts | Completed candles, indicator code, point-in-time features | Setup, theoretical entry/stop/target | Historical-only when appropriate |
| 5. Risk | Independent hard limits, equity/exposure, freshness, slippage, session | VETO / SCREEN ONLY; not authorization | Always veto when missing |
| 6. Decision | Five reports + strategy evidence | BUY/WAIT/SKIP *advisory*; explain why | No live BUY until certified pipeline |

AI can recommend or summarize, but it must not authorize capital or override the independent risk service. Never silently fabricate a missing feed.

## Delivery roadmap and acceptance gates

1. **Existing infrastructure inventory — VERIFIED against repository on 2026-10-20.**
   - CoinDCX public INR crypto updates with REST fallback, five crypto historical strategies, browser-local five-account virtual paper experiment, TradingView-attributed BSE viewer, React dashboard, GitHub CI and Vercel.
   - Existing local paper data are not a durable shared cloud execution ledger. Historic P/L is hypothetical. NSE machine-readable intraday remains unverified.
2. **Six-role research council — THIS BRANCH.** Implement deterministic source-validation, selected-strategy classification, independent research drawdown veto, WAIT/SKIP, responsive status cards, and regression tests. Verify type check + UI build + CI before merge/deploy. Clearly label unconnected news/social inputs.
3. **Source ingestion.** Assess exchange licensing; lawfully connect an authenticated free-tier Indian quote feed only with owner credentials if necessary, maintain provider quotas and failover, public crypto events, plus GDELT/news sources with timestamps, URLs and duplicate suppression. Verify freshness, symbol mappings, access terms and missing-data behavior. ₹0 is a constraint, not a reason to scrape restricted exchange endpoints.
4. **Functional intelligence.** Extend each role to independently test its inputs, version strategies and prompt/model outputs, attach citations/confidence, detect hype manipulation and avoid look-ahead. Prefer deterministic rules before paid LLM calls. AI advisory layer cannot reach execution permissions.
5. **Strategy research.** Retain current five crypto strategies; add ScalpStorm X point-in-time top-volume NSE universe only after lawful data access. Target 20 NSE sessions (2026-09-18 through 2026-10-16) *only if actual trading calendars and intraday observations confirm them*. Add transaction costs, slippage and sensitivity, walk-forward/out-of-sample testing. Each strategy has click-through rules, trade ledger, equity chart, net P/L and drawdown.
6. **Durable 24/7 paper execution.** Persist isolated per-strategy virtual accounts and source snapshots in a cost-bounded hosted ledger. Schedule a worker only as frequently as a verified free quota permits. Never claim every-second full-market background paper execution from a sleeping mobile browser or Vercel HTTP functions. Verify crash/restart, duplicates, provider outage, replay safety, clock skew, 5% virtual stop and no retroactive fills. If free continuous hosting isn't available, show accurate scheduled-checkpoint cadence instead.
7. **Dashboard and ChatGPT reporting.** Atlas displays actual source timestamp, clock, provider, market-closed behavior, positions, entry/exit, P/L, fees, worst drawdown, daily and per-strategy drilldown; ChatGPT may retrieve the *same durable report data* through authorized connectors/tools with no fabricated totals. Validate permissions and consistency on both surfaces.
8. **Release certification.** Pass unit/integration/security/fault-injection tests; review third-party source licenses, keys and cost exposure; perform mobile Safari/Chrome smoke tests, Vercel production endpoint checks, no real-money routes, no stale statuses or invented profits. Commit, merge and deploy only verified slices.

## Operating controls

- **Budget:** no new ₹ charges, subscriptions or automatic plan upgrades. Use no paid model endpoints by default.
- **Capital:** virtual ₹1,00,000 starting balance per strategy in the *current* browser lab; future shared-portfolio accounting to be explicitly defined and not double-counted.
- **Source truth:** last market event time != wall-clock time; only real provider observations update prices. No artificial tick interpolation.
- **Safety:** independent veto, user kill switch, 5% *virtual* loss halt for current experiments, stale feed quarantine, no live broker submission path.
- **Provenance:** source URL/provider, event and received timestamps, candle close, selected strategy/version, model assumptions, fees, drawdown, and every virtual event.
- **No false 100%:** full objective is accepted only when sources, ongoing paper worker, data persistence, cross-surface consistency, and production verification all pass. Current branch delivers only milestone 2.

## Branch acceptance for milestone 2

1. Run `node --test frontend/tests/agent-council.test.mjs`.
2. Run `npm run check --prefix frontend` and `npm run build --prefix frontend`.
3. Run existing `atlas-ui` CI jobs without weakening source, risk or trading constraints.
4. Verify Strategy/Research/ScalpStorm UI shows six correct cards, uses the selected strategy, has no fake news/sentiment feed, and issues no order.
5. Review PR; merge only passing tested changes; confirm Vercel production deployment SHA.
