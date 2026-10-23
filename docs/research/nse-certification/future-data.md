# Future NSE paper-data paths at ₹0 additional API spend

These are planning candidates for an already permitted account or an authorized
export. No account was opened or used, no login/token was requested, and no
runtime was connected. Existing account maintenance charges and the applicable
data agreement must be checked separately; a zero API price is not a promise
of a zero-cost new brokerage relationship or permission for third-party display.

[NSE website terms](https://www.nseindia.com/static/nse-terms-of-use) prohibit
automated collection and website-data use for virtual trading/simulations.
The document collector blocks NSE website APIs and market archives. They are
not a fallback feed; separately permitted provider data or an exchange agreement
is required.

| Route | Verified published limit | Real operating constraint |
|---|---|---|
| [Upstox historical API](https://upstox.com/developer/api-documentation/v3/get-historical-candle-data/), [standard rate limits](https://upstox.com/developer/api-documentation/rate-limiting/) | 50 requests/s, 500/min and 2,000/30min; one-minute queries bounded to one month | Shared quotas; current history is back-adjusted. Freeze authorized raw observations and full eligibility prospectively. |
| [Upstox normal Feed V3](https://upstox.com/developer/api-documentation/v3/get-market-data-feed/) | Two connections/user. Single-category Full: 2,000 instruments; mixed-mode Full: 1,500. LTPC single-category: 5,000. | LTPC alone lacks the full volume/candle evidence needed here. Multiple connections do not create a new per-user entitlement. Actual eligible count and mode mix must fit. |
| [FYERS Standard](https://fyers.in/api-docs/v3/getting-started/plans-and-limits/), [history](https://fyers.in/api-docs/v3/api/market-data/historical-data) | Data APIs: 5/s, 50/min, 5,000/day. Quotes: 50 symbols/request. Data socket: 100 symbols/user. One-year intraday retention; up to 100 calendar days/request. | A complete broad-market real-time scanner does not fit the socket cap. Historical backfill may fit quotas but needs lawful account access, archived membership and corporate-action review. |
| [Shoonya API](https://shoonya.com/api-documentation) / [Flattrade pi](https://pi.flattrade.in/docs) | Account-based API documentation is public. | Complete retained cash history, current entitlements, storage/display rights and effective full-market limits were not independently established. No certified substitute or selected-stock shortcut is claimed. |
| [NSE research-access route](https://www.nseindia.com/static/market-data/nse-data-policy) | Discretionary research arrangements/fee waivers can be considered. | Requires an applicable exchange arrangement; approval, scope and ₹0 pricing are not guaranteed. |

`research/nse-certification/planner.mjs` computes offline request budgets. The
following is an explicit **2,500-stock scenario**, not a measured eligible-stock
count. The request window is 29 calendar days with twenty sessions:

| Scenario | History requests | Conservative sustainable time | Daily quota |
|---|---:|---:|---|
| Upstox, conservative 28-day chunks | 5,000 | 75 minutes | No daily limit verified; do not infer unlimited access |
| FYERS Standard, one ≤100-day chunk | 2,500 | 50 minutes | Fits one 5,000-request day before other Data API traffic |

These times spread requests conservatively under all published windows; they
are not minimum completion-time guarantees. At this hypothetical size, neither
listed free full-feed socket cap covers the entire universe. Polling one
historical endpoint per stock each minute would require 937,500 requests per
session and exceeds both sustainable budgets. Taking quote batches around
09:30 also needs verified cumulative-volume semantics and a timestamped common
cutoff; delayed scans cannot be presented as simultaneous 09:30 observations.

The lawful prospective workflow is to retain the full dated pre-open master,
intraday-eligibility list, exclusions/suspensions and identity mapping; capture
all permitted candidate observations with both source and receipt times;
preserve exact raw hashes and timestamp authority; reject gaps and revisions;
then run certification and private offline replay. Trade-sized spreads/depth
need their own permitted source if executable-liquidity claims are desired.

Prospective collection can improve future evidence. It cannot reconstruct
missing September/October pre-open snapshots or the original publication state
of revised historical candles. No future scheduled collector or automation was
created by this research objective.
