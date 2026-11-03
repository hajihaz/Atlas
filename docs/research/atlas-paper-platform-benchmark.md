# Atlas paper trading benchmark — 2026-11-03

Public product behavior only. No proprietary code, private APIs, or copied interface assets.

## Reference products

- **QuantConnect** is the automation reference: a cloud project goes through build, backtest, and deployment with a paper brokerage. Backtest results expose equity, orders, fills, trades, logs, and source code. [Cloud workflow](https://www.quantconnect.com/docs/v2/cloud-platform/getting-started), [result evidence](https://www.quantconnect.com/docs/v2/cloud-platform/backtesting/results).
- **TradingView Paper Trading** is the usability reference: a simple order ticket has market, limit, and stop orders plus stop loss and take profit; the account view shows positions, orders, history, P/L, and a journal. [Paper trading](https://www.tradingview.com/support/solutions/43000516466-paper-trading-main-functionality/), [account manager](https://www.tradingview.com/support/solutions/43000786138-what-is-the-account-manager/).
- **Alpaca Paper** is the API simulation reference. Its paper environment is a simulation, not proof that a real exchange would fill an order. [Paper environment](https://docs.alpaca.markets/us/v1.4.2/docs/paper-trading).

## Gap against the owner's seven NSE strategies

| Capability | Atlas, verified 3 Nov | Required implementation |
| --- | --- | --- |
| Cloud operation with devices offline | Worker Cron runs; 09:40 universe, Nifty opening, after-close top-ten archive verified | Prove unattended minute capture and decisions across a real session |
| Historical replay | Full minute bars for 3 Nov top ten; X and VWAP replay returned no trade | More dated sessions, point-in-time costs and trade-by-trade reports |
| Forward paper trading | Seven accounts exist, all unarmed with zero fills | Completed live bars, per-rule decisions, next observed quote, risk and exit engine |
| Order/position journal | Old paper order history exists; seven-account summary is sparse | Per-strategy signal, skip, pending, fill, exit and reason timeline |
| Market data provenance | Hashed after-close receipts, live 09:40 sidecar | Immutable completed live one-minute receipts with capture time |
| Risk | Seven-ledger rejects same-quote fills; intraday stops/targets remain provisional | Versioned risk policy, loss ceiling, 15:15 liquidation, gap treatment |
| Other rule inputs | No qualified GIFT, dated news, 20-session same-time RVOL or adjusted ETF set | Capture and validate each, otherwise show `SKIPPED` |

## Immediate build order

1. Record exact 09:40 top-ten identities once and capture their completed one-minute OHLCV bars in cloud. One batched read-only Upstox request per minute follows [official OHLC V3](https://upstox.com/developer/api-documentation/get-market-quote-ohlc-v3/) and remains below the documented [standard API rate limits](https://upstox.com/developer/api-documentation/rate-limiting/). Validate every symbol, minute, timestamp and hash; retain immutable private receipts.
2. Join the pre-09:40 opening range to those live bars; evaluate X and VWAP only on completed five-minute candles. Require a later fresh quote and book before any *virtual* fill. Record `NO_TRADE` and `SKIPPED` as first-class decisions.
3. Add source-specific inputs for X2, X3, Xtreme and the two ETF rules. An unqualified feed produces an explicit skip, never a fabricated trade.
4. Expose a concise per-strategy evidence page: rule version, source dates, decisions, pending orders, fills, fees, P/L and reasons. Backtest and forward paper results remain separate.

Atlas must stay paper-only on Cloudflare Free, with zero paid services and no real broker order route. A backtest or retrospective signal never becomes a forward fill.

## Implemented on 3 November

The private cloud now records completed top-ten minute OHLCV, ten opening-range seeds, and prospective ScalpStorm X decisions from completed five-minute bars. The dashboard shows their date counts and the X decision journal. It is deployed after market close, so the next open session must validate actual receipts, skip reasons, Cron CPU and quote timing. These decisions do not submit or settle paper orders; seven accounts still have zero fills. The remaining six rules need their own qualified input and execution paths.
