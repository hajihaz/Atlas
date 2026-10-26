# Atlas seven-work execution pass — 25 October 2026

This pass executes the owner-approved seven-item sequence. Upstox remains parked. Additional spend is zero, real orders are disabled, and original paper losses remain preserved.

## Acceptance by work item

| Order | Work | Verified result | Remaining acceptance condition |
|---|---|---|---|
| 1 | Hosted CI | Signed-in GitHub billing shows Free, 2,000/2,000 included Actions minutes consumed, USD 12.94 usage fully discounted and USD 0 billable. Repository administrator access and Actions permissions are valid. | The included allowance resets in seven days, on 1 November; required hosted jobs must actually execute and pass on the release commit. No billing change, rerun loop or CI substitute was used. |
| 2 | Permitted live NSE data | Existing configuration and connected-provider coverage were audited. A dated Indian-equity research quote is available through Bigdata.com. | No continuously entitled NSE backend stream is established. A connected research snapshot does not confer redistribution rights or become an always-on trading feed. Upstox is excluded from this pass. |
| 3 | NSE historical certification | The known OLO candidate is unchanged at 0570761182b96724da3c43fdef547c139a3e93e8 and names only five of the frozen twenty sessions. | Fifteen sessions, upstream usage rights, historical universe and documented minute/adjustment semantics remain unavailable. Certified sessions remain 0/20. No unsupported replay was run. |
| 4 | Strategy observations | A captured real CoinDCX candle window produced 275 matching decisions across five strategies and two independently implemented calculation paths. Private input capture is added to the actual owner runner. | Forward market observation and performance qualification continue; signal parity and a HOLD are not a profitable strategy result. |
| 5 | Current IPO evidence | EAAA's nine peers now have separately dated research quotes and independently checked primary FY26 earnings inputs, visible in the owner UI and ChatGPT report. | Assessment is HOLD. No reliable fair-value target or Apply signal is established by heterogeneous historical peer multiples. |
| 6 | Genuine deadline receipt | The existing approved observer runs once per minute with one subscription; prior device-confirmed tests remain preserved. No additional test was sent. | No natural event was eligible at 19:18 IST on 25 October. The first calendar window begins at 00:00 IST on 26 October for Core4's 27 October close. An actual receipt must still arrive. |
| 7 | Production release | Changes are locally verified and prepared for the existing draft PR and normal preview path. | Production remains gated by actual exact-head hosted CI and final source/device acceptance. Main and production are not bypassed. |

The 84/100 score is a frozen engineering milestone baseline. This pass reports new accepted evidence separately; it does not count unavailable data, future events or unexecuted hosted checks as complete.

## Strategy audit and retained input receipts

The independent audit captured 83 completed two-hour bars on 25 October at 13:33:25 UTC. It compared 55 closed prefixes for each of five strategies against the separate research implementation, with zero mismatches. This covers the defined Atlas v1 rules, including simple rolling RSI; it is not a claim of Wilder RSI parity.

The captured window reproduces HOLD for every strategy at the 12:00 UTC close: SMA9 remained below SMA21 without a fresh cross; EMA12 remained below EMA26; rolling RSI14 was approximately 50.76 without an oversold recovery or exit threshold; the close remained within the previous breakout bounds; and the SPS slow average was falling. The source gate correctly rejected this read-only audit as a new paper checkpoint because the latest candle was already 93 minutes old. It did not advance any account.

Before this pass, prior checkpoints did not retain their exact candle windows. The newly downloaded window is retrospective reconstruction and cannot prove their original input bytes. Of 21 retained checkpoint records in run count 23, 15 accepted a source, eight skipped missed intervals, six rejected a source and seven were labeled running; a repeated same-bar check is not an independent strategy decision. The ledger records 53 skipped two-hour intervals. These distinctions prevent inflated observation counts.

For future accepted owner checkpoints, the runner now writes normalized hourly candles, exact composed two-hour bars, the BTCINR quote, source diagnostics, source-code hashes and exact previous/candidate snapshot hashes to a private receipt before committing the ledger. The receipt is explicitly candidate-only; its candidate hash must independently match the committed ledger. It is not a raw exchange packet or an execution receipt.

Receipts are outside frontend public files, use a 0700 directory and 0600 files, reject conflicting existing bytes and symlink targets, and retain up to 512 captures. The hosted runner has no private receipt side effect. Receipt persistence failure prevents that owner checkpoint from being committed. The original ledger and original 1,860 modeled fills are unaffected.

## EAAA independent peer assessment

Quotes are Bigdata.com provider observations from 23 October 2026, with an individual source timestamp for every row. FMP is explicitly identified in the provider currency confirmations. These are research snapshots, not certified exchange closing prices. FY26 EPS is checked against the nine pinned primary filings below; quarterly provider EPS is not annualized.

| Peer | Dated price INR | Primary FY26 diluted EPS INR | Historical price / EPS |
|---|---:|---:|---:|
| 360 ONE WAM | 997.10 | 29.19 | 34.16 |
| Aditya Birla Sun Life AMC | 889.05 | 33.68 | 26.40 |
| Anand Rathi Wealth | 2,235.00 | 23.58 | 94.78 |
| HDFC AMC | 2,250.00 | 66.50 | 33.83 |
| Nippon Life India AMC | 922.60 | 23.63 | 39.04 |
| Nuvama Wealth | 1,661.90 | 56.06 | 29.65 |
| UTI AMC | 817.05 | 31.41 | 26.01 |
| ICICI Prudential AMC | 2,651.80 | 66.7 | 39.76 |
| Gaja Alternative Asset Management, BSE quote | 115.60 | 7.17 | 16.12 |

The independent audit is separate from the unchanged issuer-reported 8 October comparison. Important basis findings:

- Anand Rathi's latest filing restates FY26 diluted EPS to 23.58 after the 1:1 bonus allotted on 3 June. The EAAA filing's 90.69 multiple already incorporates that bonus, as its footnote states, despite displaying old-basis EPS 47.17. It is not an additional issuer P/E error; do not adjust it twice.
- ABSL's consolidated diluted EPS is 33.68, distinct from standalone 34.04. Nuvama's 56.06 is already adjusted to INR 2 face value after its 5-for-1 split. HDFC's annual EPS includes its November 2025 bonus adjustment.
- ICICI's primary annual report rounds EPS to 66.7. The audit retains that precision rather than inventing additional decimals from the issuer's 66.73 comparison.
- The original Gaja row still fails its same-row arithmetic: 145.10 / 7.17 is about 20.24, not printed 16.47. That original ratio remains excluded. The separate 16.12 multiple uses a different dated BSE quote and does not resolve the filing discrepancy.
- Anand Rathi's provider Q2 EPS 5.36 differs from primary diluted EPS 5.30; neither quarterly number is used as annual EPS.

EAAA's INR 1,585–1,665 band implies 39.27–41.25 times FY26 diluted EPS of 40.36. Its unrealized variable additional return, illiquid fund marks and different revenue model weaken a simple cross-company multiple comparison. A single peer mean or median is not a validated fair-value model. The completed qualified assessment is **HOLD_FOR_MANUAL_REVIEW**, without an Apply recommendation, allotment probability or listing-gain forecast.

The public research JSON pins each primary PDF by URL, SHA-256 and physical page; the PDF files and extracted full text remain private. Nine source pages and each quote clock are displayed in the research panel.

## Validation and operating boundaries

- 15 Python report tests; seven Node issuer/source tests.
- 25 focused Node source-receipt, actual runner, decision/fill-accounting and deployment-boundary tests, including both isolated hosted and owner CLI paths.
- Ruff, TypeScript and production build passed.
- Actual Chrome owner-page acceptance at 1440px and 320px: nine peer rows, thirteen primary-source links, served-byte equality, no horizontal overflow or browser errors.
- Seven previously closed issuer records and existing notification keys, subscriptions and test receipts remain unchanged.
- Exact-head preview, required hosted job results, genuine owner capture and final release status are recorded in the session acceptance receipt after the commit is pushed.

No production promotion, live trading, paid access, new account, duplicate notification test or fabricated receipt was used.

Private bounded evidence: `.ai/raw/seven-work-session-20261025/`. Draft PR: https://github.com/hajihaz/Atlas/pull/49.
