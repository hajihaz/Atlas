# Atlas Live Paper Lab — 19 October 2026

**Actual verified scope:** public BTCINR and ETHINR observations, separate forward-only paper strategies, read-only web dashboard, local persistent worker. **No broker orders, no margin, no authenticated NSE/US/SGX quotes, no claims of profit.**

## Services and boundaries

- Browser: `Live Paper Lab` default homepage; wall clock advances per second; BTCINR and ETHINR source data refreshes about every **15 seconds** while the page is open. Quotes include source timestamps and explicit freshness checks. This is not a per-second exchange feed.
- Vercel: `GET /api/live-feed` is a read-only public CoinDCX INR market observation endpoint. `POST` and other mutation methods return 405. It never receives Mac account data or credentials.
- Mac daemon: `com.hajihaz.atlas.paper`, automatically restarted by launchd, polls **every 20 seconds**. SQLite WAL stores provider timestamps, durable paper fills and per-strategy cash/positions in `~/.atlas/live-paper.sqlite3`. Logs: `~/.atlas/paper-runner.out.log` and `paper-runner.err.log`.
- Source fetch is isolated under `scripts/atlas_public_quote_source.py`. Protected `src/atlas` cannot access an HTTP order endpoint.
- The public dashboard currently **does not sync private Mac paper P&L**. It must show **unavailable** (not ₹0) until an authenticated and secure read-only publication channel is created and verified. Live capital remains physically blocked.

## ChatGPT/HHC strategy management

Run from the Atlas live-lab worktree, with `PYTHONPATH=src` and Python 3.11:

```bash
python3.11 -m atlas.paper.live_runner status
python3.11 -m atlas.paper.live_runner add atlas-btc-sma --symbol BTCINR --kind sma --fast 5 --slow 20 --capital 100000 --allocation-bps 1000
python3.11 -m atlas.paper.live_runner add atlas-eth-momentum --symbol ETHINR --kind momentum --fast 5 --slow 20 --capital 100000 --allocation-bps 1000
python3.11 -m atlas.paper.live_runner set-active atlas-btc-sma off
python3.11 -m atlas.paper.live_runner set-active atlas-btc-sma on
```

`sma` and `momentum` operate on **last N distinct sampled observations**, not one-minute OHLC candles. They are experimental forward-paper comparison baselines, not validated profitable strategies. New strategy types require additional engine code and tests.

Each strategy holds a **separate virtual ₹1,00,000** account. Values are not added into invested owner capital. Signal at one observation; simulated bid/ask fill occurs only on the *next* independently observed timestamp. Fee assumption 10 bps, real-world exchange/broker fees unverified; slippage beyond published bid/ask, funding, market impact and fills may differ. Signals are cancelled when an observation gap exceeds 90 seconds. No order fills on stale data. No fabricated historical fills. `status` may show verified zero P&L before any trade; when a held asset has stale quotes, its equity/P&L must display unavailable.

The background worker runs only while the Mac is **on, awake, connected, and user launchd session available**. LaunchAgent is not a cloud VM and does not guarantee 24/7 observations.

## Remaining owner/external dependencies

1. Authenticated NSE cash/F&O market data (e.g. Zerodha Kite Connect with suitable data subscription or Groww trading API entitlement). Brokerage provider selection, associated costs, credentials and data rights must be approved separately; NEVER expose tokens in frontend.
2. Independent U.S. market and cryptocurrency venue adapters, exchange calendars, GIFT Nifty relationship logic, and risk-tested specifications for each.
3. Private audited Mac-to-hosted-dashboard read-only syncing (owner-controlled DB/storage project, authentication, protected data), plus proof of exact daily metrics in ChatGPT and Atlas.
4. Reliable always-on compute if the Mac is unavailable, plus data integrity soak over 30–90 market sessions. Profitability cannot be established from a few minutes of forward tests.
5. Eventual live capital: **separate owner approval, broker/compliance checks, risk limits and kill switches. Current implementation has zero real-money authority.**

## Acceptance evidence

October 19: Python unit suite **527 passed, 1 skipped**, the skip is an existing missing LEAN data fixture; JS **28 passed**; `npm run build` passed; strict MyPy and Ruff passed for new engine; launchd verified running. Live CoinDCX BTCINR/ETHINR had fresh source timestamps and the new paper strategy accounts reported **0 fills, ₹0.00** at first observation.
