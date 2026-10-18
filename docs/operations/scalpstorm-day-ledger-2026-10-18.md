# ScalpStorm X: Ten-stock day ledger, margin education and 20-day dashboard

Date: 2026-10-18. Product scope: owner-requested Atlas UI and same research
record rendered/consumable in ChatGPT. Never enable real orders.

## Financial envelope (research only)

- Virtual initial cash: INR 100,000, divided into **ten INR 10,000
  budget slots** on days where a direction filter fires. An unfilled
  reservation is not an actual position; no-trade days do not deploy funds.
- Default **1x exposure** = INR 10,000 notional per slot, INR 100,000 total.
- 2x/5x are **educational what-if comparisons only**, with INR 20,000/
  INR 50,000 notional per slot and INR 200,000/INR 500,000 total.
- Unknown real broker margin multipliers, stock eligibility, opening
  prices, quantity, actual fills, prices, fees and returns MUST remain
  null (not zero or assumed historical P&L).
- Illustrative intraday Groww charges are based on public tariff at
  https://groww.in/pricing (rates subject to change and per-order
  rounding may differ): brokerage lower of 0.1%/INR 20, small-order
  floor limited by 2.5% notional/INR 5; NSE turnover 0.00297%, SEBI
  0.0001%, IPFT 0.0001%, GST 18% on applicable fees, stamp 0.003% buy,
  STT 0.025% sell. Slippage assumed 5 bps for both entry and exit.
- Scenario movement is **NOT** a price observation. Gross estimated P&L
  is position exposure times signed movement; estimated net subtracts
  charges and adverse slippage. Over 2% modeled price changes can gap
  through stop-loss; round-trip assumptions do not model partial fills.

## Implemented day view

- Click any of 20 historical Nifty direction session cards.
- Preserve index open/09:29 close, opening % and provenance.
- Display 10 explicit allocated slots with fields for eligible name,
  share count, entry, exit, gross, fees, net P&L, and status.
- All presently unverified stock names, shares, fills and P&L remain
  em dashes. A Nifty NO TRADE index signal is not a broker confirmation.
- Pure deterministic TS math module calculates margin what-if scenarios,
  visibly separated from historical results. Real capital always blocked.

## Implemented month dashboard

- 20 Nifty dates, 8 BUY / 5 SELL / 7 NO TRADE, source consistent but
  not independently NSE-attested. Plot historical **index** opening
  movement by each day and signal counts (never label as strategy gains).
- Monthly gross/net P&L, fees, win rate, max drawdown and frequent
  selected stock names remain unavailable pending stock minute data.
- One ten-slot row per session in public breakdown JSON; no anonymous
  "stock picks" or hypothetical profits presented as actual winners.
- Same canonical public JSON data powers Atlas and ChatGPT-accessible
  public breakdown.txt / breakdown.json. ChatGPT can fetch or read
  those public endpoints on demand; this does not autonomously push
  data into chats or create a live streaming feed.

## External data access boundary

Free minute archive https://github.com/olo-labs/olo-ai-training-data-nse-min-candle
has verified source archives only to 2026-08-03 as checked 2026-10-18.
GitHub repository push date in October does not imply September/October
market content. NSE daily bhavcopy is insufficient to rank historical
opening 15-minute volume. Full results require authentic, permitted
2026-09/10 NSE broad equity-universe one-minute OHLCV plus security
master as of 09:30. Do not infer historical Groww top-ten ranking from
end-of-day data or chosen winners.

## Verification/acceptance boundaries

- UI compile and build, all Python and Node tests, no order API code
  added, full month breakdown has 200 null-filled slot placeholders.
- Test defensive evidence gate: 10 fake trades without point-in-time
  full universe metadata or consistent net P&L never show as verified.
- Deploy only scoped reviewed files, preserve other agents' modifications.
- Production smoke verify directly usable ScalpStorm deep link and
  machine-readable report routes.
- This ticket is UI/report and simulation **completion**, not a claim
  that historical strategy profitability is known.
