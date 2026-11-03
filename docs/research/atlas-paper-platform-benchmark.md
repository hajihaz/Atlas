# Atlas paper trading benchmark — 2026-11-04

Public product behavior only. No proprietary code, private APIs, or copied interface assets.

## Reference products

- **QuantConnect** is the automation reference: a cloud project goes through build, backtest, and deployment with a paper brokerage. Backtest and live results expose equity, orders, fills, trades, logs, and server statistics. Its live results continue while the browser is closed. [Cloud workflow](https://www.quantconnect.com/docs/v2/cloud-platform/getting-started), [backtest results](https://www.quantconnect.com/docs/v2/cloud-platform/backtesting/results), [live results](https://www.quantconnect.com/docs/v2/cloud-platform/live-trading/results).
- **TradingView Paper Trading** is the usability reference: a simple order ticket has market, limit, and stop orders plus stop loss and take profit; the account view shows positions, orders, history, P/L, and a journal. [Paper trading](https://www.tradingview.com/support/solutions/43000516466-paper-trading-main-functionality/), [order ticket](https://www.tradingview.com/support/solutions/43000784804-what-is-an-order-ticket/), [account manager](https://www.tradingview.com/support/solutions/43000786138-what-is-the-account-manager/).
- **Alpaca Paper** is the API simulation reference. Its paper environment is a simulation, not proof that a real exchange would fill an order. [Paper environment](https://docs.alpaca.markets/us/v1.4.2/docs/paper-trading).

## Gap against the owner's seven NSE strategies

| Capability | Atlas, verified 4 Nov 00:00 IST | Required implementation |
| --- | --- | --- |
| Cloud operation with devices offline | Worker Cron runs; 09:40 universe, Nifty opening, after-close top-ten archive verified | Prove unattended minute capture and decisions across a real session |
| Historical replay | 24 complete fixed ten-stock dates (90,000 one-minute bars) through 2 Nov; 3 Nov has 19 sampled stocks. X and VWAP returned no trade on 3 Nov top ten | Historical full-universe 09:40 rankings, point-in-time costs, trade-by-trade and drawdown reports |
| Forward paper trading | Seven accounts exist, all unarmed with zero fills | Completed live bars, per-rule decisions, next observed quote, risk and exit engine |
| Order/position journal | New owner-only seven-rule timeline and dashboard view deployed, but all seven accounts have zero fills | Prove live event progression and add closed-trade/equity charts after genuine fills |
| Market data provenance | Hashed after-close receipts, live 09:40 sidecar; the new live minute capture has zero verified dates because it deployed after close | Prove immutable completed live one-minute receipts and capture times during an open session |
| Risk | Seven-ledger rejects same-quote fills; intraday stops/targets remain provisional | Versioned risk policy, loss ceiling, 15:15 liquidation, gap treatment |
| Other rule inputs | No qualified GIFT, dated news, 20-session same-time RVOL or adjusted ETF set | Capture and validate each, otherwise show `SKIPPED` |

## Highest-value remaining gaps

1. **Closed-loop paper execution:** source-qualified signal → pending intent → later observed bid/ask and trade → virtual fill or expiry → stop/target/time exit → cash and P/L. This is the largest functional gap. It must handle long/short rules and fail closed on stale data; retrospective replays cannot become forward fills. [Alpaca describes quote-based paper simulation and its limitations](https://docs.alpaca.markets/us/v1.4.2/docs/paper-trading).
2. **True point-in-time market history:** the fixed ten-stock sample is useful but cannot certify which of all NSE equities was top volume at 09:40. Historical candidates need dated identities, complete morning bars and a no-lookahead selection path. Free storage and CPU must be measured before expanding the full universe.
3. **Seven-rule source coverage:** X2 needs same-contract GIFT; X3 needs timestamped company news; Xtreme needs 20 prior same-time volumes and sector evidence; the two ETF rules need qualified adjusted NIFTYBEES/GOLDBEES history. Missing inputs remain `SKIPPED`.
4. **Results that explain the strategy:** separate backtest and forward equity curves, drawdown, costs, every order event and source receipt. QuantConnect exposes these in its [backtest](https://www.quantconnect.com/docs/v2/cloud-platform/backtesting/results) and [live](https://www.quantconnect.com/docs/v2/cloud-platform/live-trading/results) results; Atlas only has partial source and account views.
5. **Simple trading controls:** one clear paper order ticket, active positions, orders, history and journal, with stop/target and cancellation behavior visible. TradingView's [ticket](https://www.tradingview.com/support/solutions/43000784804-what-is-an-order-ticket/) and [account manager](https://www.tradingview.com/support/solutions/43000786138-what-is-the-account-manager/) are public behavior references. Commercial multiuser work is later and outside the current $0 owner pilot.

## Implementation sequence

1. Record exact 09:40 top-ten identities once and capture their completed one-minute OHLCV bars in cloud. One batched read-only Upstox request per minute follows [official OHLC V3](https://upstox.com/developer/api-documentation/get-market-quote-ohlc-v3/) and remains below the documented [standard API rate limits](https://upstox.com/developer/api-documentation/rate-limiting/). Validate every symbol, minute, timestamp and hash; retain immutable private receipts.
2. Join the pre-09:40 opening range to those live bars; evaluate X and VWAP only on completed five-minute candles. Require a later fresh quote and book before any *virtual* fill. Record `NO_TRADE` and `SKIPPED` as first-class decisions.
3. Add source-specific inputs for X2, X3, Xtreme and the two ETF rules. An unqualified feed produces an explicit skip, never a fabricated trade.
4. Expose a concise per-strategy evidence page: rule version, source dates, decisions, pending orders, fills, fees, P/L and reasons. Backtest and forward paper results remain separate.

Atlas must stay paper-only on Cloudflare Free, with zero paid services and no real broker order route. A backtest or retrospective signal never becomes a forward fill.

## Implemented through 4 November

The private cloud is scheduled to record completed top-ten minute OHLCV, ten opening-range seeds, and prospective ScalpStorm X decisions from completed five-minute bars. The dashboard shows their date counts and journal. It was deployed after market close, so the next open session must validate actual receipts, skip reasons, Cron CPU and quote timing. These decisions do not submit or settle paper orders; seven accounts still have zero fills. The remaining six rules need their own qualified input and execution paths.

On 3 November night, Atlas archived and verified a fixed ten-stock sample over 24 sessions: 240 stock-days and 90,000 one-minute bars. The 3 November top-ten replay audit showed 10 retrospective `NO_TRADE` for X, 10 for VWAP, 30 `WAITING_REQUIRED_CONTEXT` across X2/X3/Xtreme, and both ETF rules `WAITING_ETF_HISTORY`. These are not forward fills. The data page displays complete sample coverage. On 4 November after midnight, the private strategy journal endpoint and seven strategy views were deployed. Unauthenticated reads return 401; all seven authenticated journals return correctly, with zero events and fills for 3 November. The Worker suite passed 121/121 and the frontend build passed. Live market data cannot be verified while NSE is closed; the latest inspected cloud inventory was 2026-11-03 18:34 UTC and showed zero prospective live-minute dates.
