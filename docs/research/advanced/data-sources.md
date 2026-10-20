# Data-source findings — 20 October 2026

## CoinDCX

Existing frontend/api/market-history.js uses fixed-origin public INR spot
candles, bounded requests and completed-bar filtering. The advanced adapter
adds strict gaps/duplicates, raw-byte receipts and availability assumptions.
The existing handler was not edited.

Official documentation specifies millisecond timestamps, newest-first order,
up to 1,000 records per response and 1m/15m/1h/1d intervals:
<https://docs.coindcx.com/#candles>.

Its terms currently state no API fee, restrict third-party dissemination
(section 2.3(c)), and reserve future fee changes. Public access does not
establish permission to publish derived charts/research. This mission publishes
no new CoinDCX-derived market results. Confirm intended audience/rights at
final integration.

## NSE data choices

| Source | Verified observation | Atlas boundary |
| --- | --- | --- |
| Upstox | Official free API offer. One anonymous V3 request returned HTTP 200 and 375 one-minute candles for one instrument on 18 September. | Promising ₹0 route; sustained access, full universe and rights remain unverified. Official examples also show bearer tokens. |
| Upstox BOD files | Official current beginning-of-day instrument list, plus separate MIS/suspended lists. | Today's membership cannot establish historical preopen eligibility. |
| NSE public reports/bhavcopy | End-of-day price/volume records. | Future day volume cannot rank stocks at 09:30. |
| NSE historical order/trade service | Official paid service and data policy. | No purchase or redistribution assumption. |
| Groww | Official data-inclusive offer ₹499/month plus taxes. | Excluded by ₹0 constraint. |
| DhanHQ | ₹0 trading APIs versus ₹499 data APIs. | Free orders do not imply free historical data. |
| Kite | Free Personal APIs versus ₹500/month real-time/history tier. | Paid data tier excluded. |

[Upstox access evidence](upstox-access-evidence.json) records endpoint, status,
body size/hash and row count without market prices. No token, login,
subscription or authenticated connection was created. One successful read is
not a service or license guarantee.

No complete historical preopen universe plus all-candidate opening-minute
dataset was acquired and audited. No authentic ScalpStorm performance for
the 20 sessions is published.

## Official sources

- <https://upstox.com/trading-api>
- <https://upstox.com/developer/api-documentation/v3/get-historical-candle-data/>
- <https://upstox.com/developer/api-documentation/instruments/>
- <https://groww.in/trade-api>
- <https://dhanhq.co/trading-apis/individuals-geeks>
- <https://zerodha.com/products/api/>
- <https://support.zerodha.com/category/trading-and-markets/general-kite/kite-api/articles/what-are-the-charges-for-kite-apis>
- <https://www.nseindia.com/static/resources/historical-reports-capital-market-daily-monthly-archives>
- <https://www.nseindia.com/static/market-data/eod-historical-data-subscription>
- <https://www.nseindia.com/static/market-data/nse-data-policy>
- <https://www.nseindia.com/resources/exchange-communication-holidays>

## Final owner/API-stage gates

1. Confirm private research and intended display rights.
2. Supply/reconstruct the complete preopen eligible universe for every session,
   including listings, delistings, suspensions and symbol changes.
3. Obtain authentic candidate opening windows and selected trade windows,
   with immutable raw hashes and corporate-action review.
4. Independently audit coverage/timing before historical acceptance.
5. If sustained supported access later needs a read-only owner token, connect
   it during final integration. No credentials are requested in this mission.
