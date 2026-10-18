# ScalpStorm X — 18 Sep–16 Oct 2026, point-in-time replay

**Status as of 18 Oct 2026: PREPARED, NOT BACKTESTED ON REAL NSE INTRADAY DATA.**

Approved envelope: ₹100,000 entirely virtual; 20 NSE cash sessions (Friday
2 Oct Gandhi Jayanti closed); 10 largest **09:15:00–09:29:59** cumulative
share-volume NSE cash eligible equities, chosen **at 09:30**, trades simulated
at 09:40, all remaining positions closed at **15:00**. Source: official NSE
2026 equities holiday list. Historical results must not be claimed until the
whole 20-session dataset and unbiased as-of eligible universe are obtained.

## Zero-rupee provider assessment

- NSE free CM bhavcopy: end-of-day volumes **only**. Useful for trading
  calendar/data comparison, **NOT** valid 09:30 selection evidence.
  https://www.nseindia.com/all-reports
- Groww historical candles: authenticated API, advertised ₹499/month plus
  taxes. 1-minute interval supported.
  https://groww.in/trade-api
  https://groww.in/trade-api/docs/curl/backtesting
- DhanHQ trading API can be ₹0, but its historical/market **data API**
  advertises ₹499; do not mislabel trade API as free market data.
  https://dhanhq.co/trading-apis
- Public Github datasets, Yahoo/yfinance snapshots and end-of-day leaderboards
  do **not** establish complete as-of 09:30 rankings without verified full
  candidate-universe minute bars.
- No subscription, login, token or purchase is authorized by this plan.
  Only licensed/free-and-permitted historical minute files will be imported.

## Offline replay input contract

Create private inputs **outside the public frontend**:

1. One UTF-8 CSV with exact header:
   `symbol,timestamp,open,high,low,close,volume`.
   Time represents start of candle; timestamp ISO-8601 with **+05:30**.
   Include a `NIFTY` row every minute from 09:15 through
   09:29 for direction determination.
2. A JSON with:
   `{"captured_before_market_open":true,"exchange":"NSE","segment":"CASH","sessions":{"2026-09-18":["..."]...}}`.
   This must reflect **all** eligible pre-open cash stocks as of each
   of 20 trading dates, not a handpicked post-hoc top ten. Provider
   provenance, original payloads, and point-in-time membership must be
   independently verified before the run may be considered genuine.
3. For every eligible stock, provide all 15 opening minute bars.
   For every selected stock provide every 1-minute bar 09:40–15:00.
   Missing/minute-gap/inconsistent/duplicate data means **no result**.
   Top ten are ranked by cumulative share count, tie by symbol.

Run from Atlas repo with installed Python package:

    PYTHONPATH=src python3 scripts/scalpstorm_replay.py \
      --minute-csv /private/authorized/nse-minute.csv \
      --universe-json /private/authorized/nse-universe.json \
      --output /private/authorized/scalpstorm-results.json

No input => exit status 2 and **no P&L output**. Output is hashed/source-bound,
marked UNVERIFIED_INPUT and never published to the demo automatically.

## Frozen research rules and limitations

- No broker order API, no real trading, no leverage (maximum gross 1x).
- Direction: NIFTY opening 09:15 price to 09:29 close; >+0.15% BUY,
  <-0.15% SELL, otherwise NO TRADE. This threshold is a predeclared
  research assumption, **not** a previously confirmed exact rule.
- Capital evenly divided into ten nominal ₹10,000 slots; whole shares.
- Default stop 2% per position, high/low stop touch assessed conservatively;
  adverse gap fills at worse minute-open, 5 bps assumed adverse slippage
  on each side; closing at 15:00 candle open.
- Groww NSE intraday cost approximation (brokerage 0.1% capped at ₹20,
  min ₹5 or 2.5% of trade value when smaller, STT 0.025% sell,
  stamp 0.003% buy, exchange 0.00297%, SEBI 0.0001%,
  NSE IPFT 0.0001%, GST 18% on applicable fees). Actual broker
  reconciliation and tax/rounding rules can vary.
  https://groww.in/help/stocks/sx-pricing/what-are-intraday-charges
- OHLC one-minute replay cannot resolve all tick-level order sequencing:
  fill/stop approximations are research estimates, not executed quotes.
- Short-selling constraints, physical price bands, symbol corporate actions,
  liquidity/participation and provider licensing require separate attestation.
- "Groww top intraday volume" UI ranking may use a different universe,
  filters, rank definition or time basis. Only claim **Groww-exact**
  fidelity if those semantics and as-of universe can be verified.
- Research must publish win/loss only after all 20 days pass quality gates,
  with result type and data source evidence. One month is insufficient
  to prove a persistent edge.
