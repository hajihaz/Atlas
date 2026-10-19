# Atlas real INR research dashboard — 19 October 2026

## Intent

The previous Atlas overview displayed archived 2013 LEAN algorithm fixture balances
(e.g. a US-dollar mock equity curve) and a stale static test count. These were
not a live account. The active dashboard must **never** show synthetic account
holdings, fabricated profit, estimated trading executions or dollar-denominated
examples as real financial performance.

## Implemented

- The Overview and Market Watch both use a fresh `GET /api/market-inr` read-only
  response; legacy `frontend/src/data/snapshot.json` is no longer imported by
  the active UI. Historical fixtures remain in Git history for audit.
- Direct public Coinbase BTC-INR/spot and ETH-INR/spot observations in
  **INR**, without silently using a guessed USD/INR conversion.
  The source is an **indicative price reference**, not a trading venue last
  fill, authenticated NSE quote or executable exchange order-book price.
- Every source reports independent retrieval time; source does not supply
  actual trade event time. If the provider is missing, invalid or stale on
  the client, the numeric value is hidden and labelled unavailable.
- The homepage refreshes via an explicit button and every 60 seconds
  while open. Serverless backend provides short bounded in-process cache,
  five-and-a-half-second upstream timeout, hardcoded pair allowlist and GET-only
  contract. No broker tokens or financial secret is sent to the browser.
- NSE phase is derived from `Asia/Kolkata` time and the official published
  **2026** exchange holiday calendar (including Dussehra 20 Oct). Normal
  equity session 09:15 to 15:30 IST, with pre-open beginning 09:00.
  Scheduled session hours do **not** assert the exchange is actually open.
  Unscheduled closures remain possible and later years require new calendars.
- NSE stock cards explicitly show **unavailable / provider required** until
  an authorised, exchange-permitted, timestamped provider connection is added.
  No fake Reliance, TCS or Infosys quotes.
- All visible money formats are `₹` (`INR`), without converting a historical
  US-dollar simulated equity into a misleading current-rupee portfolio.
- Strategies, Research, ScalpStorm X, Orders and Audit retain their navigation
  and safe readiness actions but do not expose previously unverified hypothetical
  profits or historical community index signals as trades. A real broker/paper
  ledger is still NOT connected.
- Risk center still lists trading as BLOCKED; public frontend has no order route,
  paper fills, brokerage keys or unsafe authority controls.

## Truthful next steps and limitations

- Coinbase public spot endpoint may restrict INR pairs or network regions. If
  unavailable, the dashboard must show unavailable—not fake live prices.
- Connection to real intraday NSE stocks requires approved authenticated market
  data, its redistribution terms and a private backend. No scrape bypass.
- Genuine portfolio value and profit require linked holdings and authenticated
  broker statements or fully reconciled paper orders. No filled trades are
  inferred from a chart or from an index source.
- Kraken's existing research USD raw historical endpoints were not changed:
  their independent provenance remains for offline audit, but they are not
  loaded by the INR-only live dashboard.
- Live capital remains BLOCKED, entirely separately from frontend readiness.

Official sources:
- NSE session timings: https://www.nseindia.com/static/market-data/market-timings
- NSE holidays: https://www.nseindia.com/resources/exchange-communication-holidays
- Coinbase spot API documentation: https://docs.cdp.coinbase.com/coinbase-app/advanced-trade-apis/overview
