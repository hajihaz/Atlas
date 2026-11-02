# Atlas cloud minute-history pilot — 30 October 2026

## Provenance and current evidence

- Source: authenticated **read-only** Upstox Historical Candle V3 GET, one equity and one completed session per request. The Analytics Token remains a Cloudflare Worker secret. No brokerage order endpoint is used.
- Separate private Cloudflare Free D1 database `atlas-free-history-pilot` (UUID `387b2c68-482a-490a-97fc-40633652f502`). This database cannot fill the cloud paper ledger. Raw provider JSON, body SHA-256, byte count, retrieval time, exact source URL, first/last minute, and evidence class are stored under a unique `(instrument_key, source_date)` key. Replays verify the stored hash and never replace a receipt.
- Dated premarket MIS receipts for 28 and 29 October identify ten normal NSE equities in the fixed pilot cohort: AXISBANK, BHARTIARTL, HDFCBANK, ICICIBANK, INFY, ITC, NHPC, RELIANCE, SBIN, TCS. A dated receipt also exists for 30 October. Later fixed-watchlist captures are explicitly labelled as **not qualified by a dated MIS roster** until such a receipt is connected.
- At 03:05 UTC on 30 October, remote D1 held 20 complete symbol-days (ten on each of 28 and 29 October), each with 375 dated 1-minute bars from 09:15 through 15:29 IST: **7,500 bars** and **485,585 raw provider bytes**. Database size was 532,480 bytes. Every HTTP capture returned a SHA-256 receipt; the NHPC 29 October repeat returned `VERIFIED_EXISTING` without refetching.

## Reproducible model comparison

Draft Worker version `d27c734d-0e52-4461-8573-5f09f9c9972d` produced private, owner-authenticated results stored at `.ai/evidence/atlas-history-cohort-20261028-29.json`. Its successor draft adds scheduled capture. For each session, a 09:40 decision uses only summed volume through the completed 09:39 minute and momentum through its close. A modeled entry uses the **09:41 open**; a 15:15 scheduled exit uses the **15:16 open**. Both sides include 5 bps adverse slippage and 10 bps assumed fee. Capital is virtual ₹100,000 per session. No order is sent.

| Pilot rule | Two-day modeled net P&L | Winning trades | Winning days |
| --- | ---: | ---: | ---: |
| Top 1 by 09:39 cumulative volume | ₹872.06 | 1/2 | 1/2 |
| Top 3 by 09:39 cumulative volume | ₹811.48 | 4/6 | 2/2 |
| Top 3 positive early momentum among volume leaders | ₹1,312.93 | 4/6 | 2/2 |

These are **retrospective ten-name pilot results over only two sessions**. They are not the full NSE MIS ranking, a production 09:40 point-in-time result, a reliable win-rate estimate, or earned profit. The model omits actual exchange charges, taxes, queue position, spread, market impact, and outages. The named cohort was selected for plumbing validation, not as an ex-ante market-wide universe.

## Cloud schedule in the isolated candidate

The candidate adds one Cloudflare Cron expression `0-9 11,13 * * 1-5`: ten one-symbol jobs at 16:30–16:39 IST and an idempotent retry at 18:30–18:39 IST on weekdays. Each invocation makes at most one historical provider GET and writes one raw receipt to separate D1. Invalid, absent, revised, early, or incomplete data fails closed. A market holiday can yield no capture; it cannot produce a synthetic result. This trigger is **not active** until the candidate is deployed and triggers are explicitly applied after the 09:40 paper check.

The paper-only `/healthz` and owner-only endpoints remain independent of the owner's Mac. The new archive uses Cloudflare Free D1, whose limits stop writes when exceeded. No R2 usage-based storage, paid plan, overage billing, real order, public raw-data redistribution, or GitHub release is part of this pilot.

Sources: [Upstox Historical Candle V3](https://upstox.com/developer/api-documentation/v3/get-historical-candle-data/), [Upstox Analytics Token](https://upstox.com/developer/api-documentation/analytics-token/), [Cloudflare Workers Free limits](https://developers.cloudflare.com/workers/platform/limits/), [Cloudflare D1 Free limits](https://developers.cloudflare.com/d1/platform/limits/), [NSE data policy](https://www.nseindia.com/static/market-data/nse-data-policy).
