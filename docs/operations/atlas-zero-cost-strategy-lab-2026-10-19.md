# Atlas ₹0 data and operational strategy workbench — 19 October 2026

## Free provider audit

- CoinDCX public INR crypto ticker, 1s public stream and candlestick endpoint: no API credentials or paid market-data subscription required for this research usage, subject to provider rate limits and changing terms. Backend requests are bounded and cached. Five cryptocurrencies are supported via the existing allowlist. Use observed timestamps; no fictitious quotes.
- NSE data rights: **do not** scrape restricted live exchanges or present chart widget pixels as licensed machine-readable candles. See NSE Data Sharing & Usage Policy https://www.nseindia.com/static/market-data/nse-data-policy — it restricts distribution and sharing.
- TradingView's *official free embeddable Advanced Chart* widget provides a usable Indian equity end-of-day chart viewer for supported BSE symbols (provided TradingView offers the data); exchange entitlements and delays are vendor-controlled. The widget itself does **not** grant data-reuse permission. https://www.tradingview.com/widget-docs/widgets/charts/advanced-chart/
- An authenticated Upstox V3 broker market feed remains optional, **not connected** and never assumed free of account/broker constraints. It requires a bearer token; never embed in the browser. https://upstox.com/developer/api-documentation/v3/get-market-data-feed/
- No paid subscriptions, broker charges, premium plan upgrades, real-money orders or production DB modifications were authorized or incurred as part of this release.

## Functional implementation

1. **Strategy Library & Research Lab:** five independent, documented strategies: SMA 9/21 Crossover, EMA 12/26 Momentum, RSI 14 Mean Reversion, 20-Bar Breakout, SPS Swing Pullback. Click a strategy to inspect rules, source range and timestamp, model equity/return/drawdown, closed trades, win rate, modeled fees and transactions. One upstream market-history request powers all five strategy calculations.
2. **Backtest engine** `frontend/lib/research-engine.js`: deterministic, zero-account simulations using provider-returned completed INR candles. A signal based on *prior close* is modeled at the *next bar open*, preventing look-ahead. ₹1,00,000 is explicitly virtual starting capital; fee is hypothetically 0.10% and slippage 0.05% per transaction side. No forced liquidation of an open position at the final bar. No broker market-impact, order-book liquidity, tax/charges, corporate actions or live execution rights are implied. Actual returns may be completely different.
3. **Forward virtual paper trial**: five strategy accounts, each starting with *virtual* ₹1,00,000, using source-validated real INR 1-minute candles and *subsequently timestamped* public spot snapshots. A model decision may create a browser-local hypothetical fill only after the source bar closes and the fresh quote arrives. Captured fill timestamp/price/fee, virtual holdings, equity and ledger survive reloads through browser localStorage. Replayed or stale data cannot create a second event. A data gap greater than 3 minutes, or 5% virtual model loss, automatically pauses the affected trial. No fill ever comes from a real broker. **Runs only while Atlas remains open in that browser; this is not a server-side 24/7 agent.**
4. **Market Watch**: official third-party TradingView BSE EOD charts embedded via documented external-embedding script, with source attribution, and a separate CoinDCX INR crypto watchlist. Because the data resides inside a vendor-controlled widget, prices are not imported into Atlas's backtesting or order feed. Vendor exchange data can be delayed or gated.
5. **Risk and Audit pages**: display live local paper strategy counts, virtual event counts, modeled risk gates and source evidence; real-capital block retained but not a repetitive splash. Existing engine, signing, reconciliation, PostgreSQL recovery and business risk controls remain unchanged.

## Status honesty and remaining gates

- Historical *replays* are NOT earned profits and not forward paper execution. Virtual forward paper fill prices come from indicative public quotes and modeled costs; no external ledger reconciliation. The storage is client-local and can be lost or edited. The owner must not use these numbers as certified trading performance.
- External NSE stock market-data integration still requires a lawful machine-readable provider; chart widgets do not supply this for model orders. ScalpStorm X's top-ten intraday NSE strategy and any other stock-specific paper testing remain pending independent source data.
- Production-grade forward paper trials require a durable background worker, server/database audit ledger, timestamps, exchange sessions, alert/halt delivery, and secure owner-paired execution. This browser-only step deliberately does not claim 24/7 service.
- No live-money broker credentials, order routing, execute endpoints, data redistribution or HHC privilege changes. Real-money trading **remains BLOCKED**. Its gate is not falsely changed to working just because user dislikes status wording.
- Free provider offerings and quota policies can change; no promise of limitless free real-time NSE APIs.

## Acceptance checks

Node regression: source validation, look-ahead tests, mock cost accounting, side-effect-free strategy endpoint, paper cursor/fill idempotence and gap halt, all app routes and vendor attribution. TypeScript and Vite build, Python/PostgreSQL project CI unchanged, production Vercel smoke tests of actual `/api/strategy-lab` and market-history endpoints. Visual TradingView widget operation and sustained public socket should be checked in a real browser separately; automated HTML/API tests cannot certify those third-party render paths.

Provider correction: TradingView official free widget market list (https://www.tradingview.com/widget-docs/markets/asia-pacific/) shows BSE *EOD* equities and MSEI real-time (where available); no unsupported assertion of free real-time NSE prices. Vendor chart data cannot be extracted for algorithmic research.
