# Atlas light theme + closed-candle paper-data milestone (2026-10-18)

## User-facing change

- **Light theme is the default** for first-time visitors. The existing
  dark theme stays available through a keyboard-accessible Moon/Sun toggle
  in the top bar. The choice persists in `localStorage` across sessions,
  with a safe fallback when storage is blocked. The browser theme-color and
  chart grid/line change with theme.
- Light styles cover navigation, overview, charts, strategies, research,
  risk and audit, market watch, notifications, buttons and mobile breakpoints.
  The PWA splash manifest now matches the new default light theme.
- Theme changes are **presentation only** and do not affect risk authority
  or market-data permissions.

## Paper-data foundation, not paper orders

- New **read-only** `GET /api/closed-candles` obtains public Kraken Spot
  BTC/USD and ETH/USD **1-minute OHLC** bars from a fixed allowlisted URL.
- The Kraken REST payload includes the **currently forming** candle as its
  last row. That row is explicitly discarded; only the most recent complete
  row can be surfaced. It receives an observed closing timestamp, plus
  source, age, validity and freshness status. Duplicate/out-of-order,
  non-finite, impossible OHLC, stale and future bars fail closed.
- Kraken may omit intervals without trades. No missing bars are estimated,
  forward-filled or passed off as a genuine trade.
- The Market Watch now displays separately timestamped closed research bars.
  They are marked `paperEligible:false`, and the public API explicitly
  returns both `paperExecutionEnabled:false` and
  `liveOrdersEnabled:false`. Closed candles alone do **not** prove
  execution-quality quotes or validate broker paper fills.
- A pure-stdlib Python `ClosedCandleQualityGate` independently enforces
  causality, timezones, source identity, 1-minute interval, freshness, OHLC
  consistency, volume and sequence continuity. It has **zero** network,
  order or broker authority.
- HTTP mutation attempts are rejected (405). No credentials, order APIs
  or account permissions are added, and no third-party packages installed.

## Verification

- `node --test frontend/tests/market-quotes.test.mjs`
- `node --test frontend/tests/closed-candles.test.mjs`
- `node --test frontend/tests/theme-contract.test.mjs`
- `npm run check --prefix frontend && npm run build --prefix frontend`
- `python -m ruff check src tests scripts`
- `python -m mypy src/atlas`
- `python -m pytest -q --disable-warnings --strict-markers`
- Actual production `GET /api/closed-candles` after Vercel deployment.
- CI on the exact published commit must be green before considering done.

## Explicit remaining gates

- **Genuine paper execution** requires a qualified market feed with reliable
  event timestamps and sequencing, paper broker integration and callback
  reconciliation, independently enforced simulated risk, transparent costs,
  session/outage tests, and a reproducible persistent paper ledger.
  Public OHLC research observations cannot replace these requirements.
- NSE authenticated market quotes still require **private broker credentials
  and exchange data rights**. Do not publish restricted NSE data.
- Production live orders remain **BLOCKED**; real-money authorization,
  compliance and risk/governance controls were not modified.
- The upstream LEAN Python.NET intermittent GIL crash remains unresolved.

Kraken documentation:
- https://docs.kraken.com/api/docs/rest-api/get-ohlc-data/
- https://support.kraken.com/in/articles/360047124832-downloadable-historical-ohlcvt-open-high-low-close-volume-trades-data
