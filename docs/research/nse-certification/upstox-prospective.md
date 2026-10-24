# Upstox read-only path and prospective receipts (prepared, not connected)

**Status on 24 October 2026:** the owner's Upstox application is submitted and
under NSE review. No account token was generated or connected, no authenticated
market request was made, and no hosted daily job was created. Actual capital is
₹0 and Atlas has no live order route.

Upstox documents a [free, one-year, GET-only Analytics Token](https://upstox.com/developer/api-documentation/analytics-token/)
for market quotes, historical data, fundamentals, news and related read-only
categories. It cannot place or modify orders. After account and intended-use
rights are approved, **the owner** must create and hold the token privately;
never paste it into a chat, browser build, repository, URL or log. The token is
not needed for the public instrument-file receipts below.

The [official instrument files](https://upstox.com/developer/api-documentation/instruments/)
provide current NSE BOD, NSE MIS and suspended lists; Upstox says they refresh
around 06:00 IST and may change intraday. `upstox-prospective.mjs` fixes these
three official HTTPS URLs, allows only GET without redirects or credentials,
validates gzip/JSON and size, and retains exact raw SHA-256 hashes, provider
`Last-Modified` when supplied, and local receipt time. Captures are private under
ignored `data/local/upstox-prospective/YYYY-MM-DD/`; duplicate days are refused.
The output never contains a token. `receipt.json` deliberately says
`certifiedHistoricalSessions: 0` and `fullUniverseVerified: false`.

The dry plan is safe to run now:

```text
node scripts/upstox_prospective_capture.mjs plan YYYY-MM-DD
```

Actual collection remains owner-gated. **Only after account and data-rights
approval**, set `ATLAS_UPSTOX_CAPTURE_APPROVED=1` for one local invocation of
`capture YYYY-MM-DD` during 06:30–09:14 IST on that same weekday. The program
refuses weekends, backdating, pre-06:30, market-open-or-later calls, missing
approval and overwrites before a provider request. Exchange holidays still
require an independent calendar check. A local machine clock and an HTTP
`Last-Modified` header are useful receipts, **not independent historical
publication attestation**. No automatic schedule is enabled while approval and
hosted CI are blocked.

`historicalCandleUrl` prepares only the official
[Upstox V3 one-minute GET route](https://upstox.com/developer/api-documentation/v3/get-historical-candle-data/)
for a stable NSE equity ISIN key and at most 28 inclusive calendar days. It
constructs a URL; it does **not** fetch. Any later token-bearing client must
be server/local only, enforce Upstox's [shared standard API limits](https://upstox.com/developer/api-documentation/rate-limiting/),
and stay read-only. Historical candles can be back-adjusted and cannot prove
their original publication state or recreate deleted/renamed stock identities.

These current-day receipts are only one prospective input. Before ScalpStorm
can claim any of the frozen 20 September–October sessions, an independent
review still needs that session's *actual* pre-open full eligibility,
suspensions, identity/series, corporate actions, original one-minute stock and
index OHLCV, recorded publication times, private-use rights and permitted
derived-result publication. Today's BOD must **never** be relabelled as a
September BOD. Certification remains **0/20 authentic NSE stock sessions**;
trade P/L remains unavailable, not ₹0 or invented returns.
