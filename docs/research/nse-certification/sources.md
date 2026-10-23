# Source research — 23 October 2026 UTC

**No complete, independently validated, lawfully usable ₹0 dataset was found
for this exact request. This is a bounded research finding, not proof that no
such privately held archive exists. Authentic sessions certified: 0/20.**

All exact request URLs, UTC retrieval times, HTTP statuses, byte counts and
SHA-256 values are in `source-receipts.json`, `followup-receipts.json`,
`pinned-receipts.json` and `calendar-receipts.json`. Source snapshots remain
private for verification. No market-price archive or raw broker observations
were added to Git. `source-findings-pinned.json` is the authoritative machine
inventory; the earlier provisional inventory was retained privately.

## Official exchange and regulatory sources

| Resource | Finding and decision |
|---|---|
| [NSE 2026 cash holiday circular CMTR71775](https://nsearchives.nseindia.com/content/circulars/CMTR71775.pdf) | The only scheduled full-day holiday inside the requested weekday window is 2 October. This establishes twenty scheduled sessions, not data coverage. |
| [Daily/monthly archives](https://www.nseindia.com/resources/historical-reports-capital-market-daily-monthly-archives), [reports](https://www.nseindia.com/all-reports) | EOD bhavcopy is useful reference evidence. It cannot establish 09:30 opening-volume ranks or full pre-open intraday eligibility. |
| [Historical service](https://www.nseindia.com/static/market-data/eod-historical-data-subscription), [master data](https://www.nseindia.com/static/market-data/paid-master-data) | Official historical order/trade and master services are offered as paid products. No unconditional ₹0 full-universe minute archive for this window was verified. |
| [Securities lists](https://www.nseindia.com/static/market-data/securities-available-for-trading) | Current security lists and symbol/name-change CSVs are published. They do not themselves prove every historical intraday eligibility/suspension state before each opening. |
| [NSE sharing/usage policy](https://www.nseindia.com/static/market-data/nse-data-policy) | Use and redistribution depend on the relevant agreement. Research access follows the exchange's research route; discretionary fee waivers are possible, without a guaranteed entitlement. A public URL or a repository's software licence does not establish an exchange data grant. |
| [NSE website terms](https://www.nseindia.com/static/nse-terms-of-use) | Prohibit automated data collection and using website data/content for virtual trading or simulation. Website quote APIs and report scraping are rejected as a free paper-data acquisition route. A separately applicable licensed arrangement would need its own permission evidence. |
| [SEBI circular, 8 May 2026](https://www.sebi.gov.in/sebi_data/attachdocs/may-2026/1778242522289.pdf) | Educational sharing/usage is subject to a 30-day lag and appropriate sharing agreements. That route does not automatically cover this recent twenty-session window. Private broker research and an educational redistribution arrangement have distinct scopes. |

No agreement, waiver request or message was sent to an exchange, provider or
dataset author. No subscription, upgrade, account opening or broker login occurred.

## Dataset candidates

| Dataset and inspected revision | Actual evidence | Decision |
|---|---|---|
| [OLO minute archive](https://github.com/olo-labs/olo-ai-training-data-nse-min-candle/tree/0570761182b96724da3c43fdef547c139a3e93e8), commit `0570761182b96724da3c43fdef547c139a3e93e8` | Immutable tree `fe5592007a4b9b7df35480feeba9456af4690d52` and pinned directory agree: 456 stock archive names, 25 Nov 2024–24 Sep 2026; five requested dates. The README's earlier coverage statement is stale. | Candidate metadata only. Fifteen requested stock archive names absent. Upstream rights, PIT universe, minute contents, actions and publication availability unverified. |
| [gsidhu/nse-intraday-data](https://github.com/gsidhu/nse-intraday-data/tree/c95d7f187c2a317ca6a2287148cf10c50a80e928), commit `c95d7f187c2a317ca6a2287148cf10c50a80e928` | Pinned root contains year directories 2012–2023 plus index folders. | No requested-window complete cash-equity archive verified. No retrospective index/constituent substitute accepted. |
| [voletiramu/nse-fno-1min-data](https://github.com/voletiramu/nse-fno-1min-data/tree/2c01a18c694f245556ff58bf7b882280f1de3679) | Advertises 214 April-2026 F&O underlyings, April 2024–April 2026. Release `v1.0.0` metadata supplies a ZIP digest. | Outside the window and a restricted retrospective stock universe. Publisher-reported release digest was not represented as a locally verified downloaded hash. |
| [Hitjob-Done minute dataset](https://huggingface.co/datasets/Hitjob-Done/indian-stock-market-minute-data) | Both public metadata and README requests returned HTTP 401. | Coverage and rights unverified. No login or access bypass attempted. |
| [djjain21 historical dataset](https://github.com/djjain21/NSE-Futures-Options-F-O-Historical-Dataset-1minute-from-2015-2026/tree/bd312bfe6488e629cbe5c05a2a9643fab5f4fc33) | README advertises derivatives through June 2026 and purchase inquiries. | Does not supply the requested free cash-equity window. |
| [tejhq/tej-bazaar](https://github.com/tejhq/tej-bazaar) | EOD pipeline and monthly trailing-liquidity universe. | Useful reference research; not the requested complete opening-minute dataset or eligibility record. |

OLO's [pinned FAQ](https://github.com/olo-labs/olo-ai-training-data-nse-min-candle/blob/0570761182b96724da3c43fdef547c139a3e93e8/docs/FAQ.md)
leaves timezone and `:59` interval-boundary semantics unconfirmed, has no
adjustment metadata and notes upstream-rights obligations. No conversion or
financial replay was attempted. The alias tree response had an inconsistent
root identity field; the inventory uses the separately captured immutable tree,
Git commit and pinned contents cross-check. Both receipts are retained.
The pinned tree contains no index archive name for any of the twenty requested dates.

| Requested date with a stock archive name | Git blob SHA-1 — metadata only |
|---|---|
| 2026-09-18 | `022d98daa91203c06d204529e207558655c95695` |
| 2026-09-21 | `10746ceb3e3e1275c1105ccf6be0761947384775` |
| 2026-09-22 | `d06bb6fdfa6027440f1bc481a6765f038ee47bab` |
| 2026-09-23 | `dffe666b658b12262b4e7764cd4a30585170dd43` |
| 2026-09-24 | `39a146773a6e8cf7be28751af818da6e7bac4e25` |

All five downloaded-archive SHA-256 fields remain **null**. These blob IDs are
not hashes of locally inspected ZIP bytes and do not certify their prices.

## Broker-provider assessment

[Upstox V3 history](https://upstox.com/developer/api-documentation/v3/get-historical-candle-data/)
advertises minute history from 2022 with bounded query ranges, and
[API access](https://upstox.com/trading-api/) is advertised free. Two dated
provider-community replies clarify the important limits:

- [19 October private research guidance](https://community.upstox.com/t/clarification-on-storing-upstox-nse-market-data-locally-for-private-research-backtesting/18112): private retention/replay is permitted for account users; account access is required; redistribution requires a separate arrangement.
- [19 October historical-data guidance](https://community.upstox.com/t/clarification-on-upstox-historical-candle-v3-data-usage-for-personal-backtesting-and-ml-research/18061): historical delisted/merged instruments and historical symbol/ISIN mappings are unavailable; splits/bonuses are back-adjusted and dividends are not.

The captured author profile/post title identifies “Developer @ Upstox”. These
are useful provider statements, not a new agreement for Atlas or permission for
an unrelated archive. The earlier research branch's anonymous one-instrument
HTTP-200 probe was not reused as lawful full-universe coverage. No broker price
request was made in this objective after verifying the account requirement.

[Upstox instrument files](https://upstox.com/developer/api-documentation/instruments/)
include current BOD, MIS and suspended lists. No dated full set for every
requested pre-open was verified. Current lists, future corporate-action factors
and surviving instruments would introduce selection or look-ahead risks.

[FYERS Standard](https://fyers.in/api-docs/v3/getting-started/plans-and-limits/)
is a conditional ₹0 future route with account permission and retention/scale
limits. [Shoonya](https://shoonya.com/api-documentation) and
[Flattrade pi](https://pi.flattrade.in/docs) are further account-based candidates;
this research did not establish a complete licensed historical universe or
capture one through them. No broker price endpoint was probed.

Captured pricing pages for [Groww](https://groww.in/trade-api),
[Dhan data](https://dhanhq.co/trading-apis/individuals-geeks), and
[Kite Connect](https://zerodha.com/products/api/) require paid data access
for the relevant history: advertised ₹499/month plus taxes, ₹499/month and
₹500/month respectively. A free trading-only API is insufficient. No trial,
upgrade or purchase was activated.
