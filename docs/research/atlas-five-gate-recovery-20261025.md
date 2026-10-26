# Atlas five-gate recovery — 25 October 2026

This pass acts on Haji's explicit approval to resume the five existing data,
observation, IPO, deadline and hosted-CI gates. It preserves the frozen objective
and does not reopen completed dependency, streaming or notification setup.

## Current EAAA filing recovered

A public alternate lead-manager source resolved the previous issuer/Nuvama
403/502 retrieval problem. The EAAA review now joins four byte-verified Axis
Capital documents to the same issuer and offer window:

| Document | SHA-256 | Selected physical pages |
| --- | --- | --- |
| [19 October RHP](https://www.axiscapital.co.in/contents/EAAA%20India%20Alternatives%20Ltd%20-%20Red%20Herring%20Prospectus-1792429309.pdf) | `9f6c1b86c07db2f86c3a612555f982c4d45a256cc0be2eb883ae1849feda40b1` | 1, 2, 24, 27–29, 35–36, 83, 85–86 |
| [Price basis](https://www.axiscapital.co.in/contents/EAAA%20India%20Alternatives%20Ltd%20-%20Basis%20for%20Offer%20Price-1792575650.pdf) | `028b5d822d0572bdb43f35a54df13fe8f0005295c3d109beaff59fd7e599cd44` | 1–3 |
| [Abridged filing](https://www.axiscapital.co.in/contents/EAAA%20India%20Alternatives%20Ltd%20-%20Abridged%20Prospectus-1792429422.pdf) | `c04bf7259d7da392ba8c45b12aefc299ac4c81b8b380fa461bb8e3deddc14cae` | 7–8 |
| [Price-band notice](https://www.axiscapital.co.in/contents/EAAA%20India%20Alternatives%20Ltd%20-%20Pre-offer%20and%20Price%20Band%20Advertisement-1792559256.pdf) | `05953e0edfa4615d41fcdd252cab54204b86954a6cb361272e496fc690f025b3` | 1 |

The selected review contains 11 annual/quarterly financial metrics. Quarterly
figures remain separate and are not annualized. Fresh offer prices can now
produce the historical annual-EPS P/E scenario of 39.27–41.25; this does not
certify fair value or trigger an Apply verdict. The primary notice confirms a
nine-share minimum lot, also identified in the review basis.

The issuer's peer table uses 8 October prices. Its Gaja row prints P/E 16.47,
although the same-row price/EPS arithmetic gives about 20.24. Native rendering
confirmed that the discrepancy is in the printed table. Atlas flags it and
excludes that peer rather than silently correcting or certifying the comparison.
Independently current valuation remains open, and the decision remains HOLD.

All seven other issuer records match the verified `22ed992` baseline exactly.
Full source PDFs and extracted text stay outside the commit. The original pypdf
limits remain enabled: three documents extracted successfully; the large scanned
price-band notice was inspected with bounded native PDFKit page rendering.

## NSE source acceptance

The [official NSE MCP documentation](https://www.nseindia.com/nse-mcp) describes
five years of daily history and quotes delayed by 1–3 minutes, not the required
historical minute-bar contract. Both published endpoint capability requests
returned HTTP 404 from the owner Mac. Its linked [terms](https://www.nseindia.com/static/nse-terms-of-use)
also prohibit using website data for virtual trading or simulation. No stock
paper-data integration was enabled from this source.

[Tapetide's MCP catalogue](https://tapetide.com/mcp) describes daily/weekly price
history and explicitly says it is not a live trading feed. Google OAuth or a
personal token would not, by itself, establish the missing minute data,
point-in-time universe, adjustment coverage or intended-use rights. No account,
trial or paid entitlement was created. ScalpStorm remains **0/20 certified**;
its historical financial results remain unavailable.

## Genuine observation and deadline evidence

The existing source-backed BTC/INR research ledger advanced to checkpoint 23 at
12:08 UTC / 17:38 IST, using the completed 12:00 UTC bar. All five strategies
reported HOLD / NO_ELIGIBLE_SIGNAL, zero modeled fills, zero realized P/L and
zero fees. Each research account retains its own INR100,000 virtual baseline.
These are observations, not profitability qualification or completed NSE tests.

The two original risk-halted accounts remain inactive with all 1,860 recorded
fills and losses preserved. All five Mac services remained running with unchanged
PIDs; none was restarted.

The owner-local genuine-deadline audit contains zero real delivery records.
The future calendar event remains a time gate. No test notification, duplicate
send, synthetic clock or simulated device acknowledgement was used. Existing
bounded follow-up ownership remains unchanged.

## Verification and release boundary

This delta passed 13 Python tests plus six subtests, five Node source/research
tests, Ruff, TypeScript and the production build. Actual Chrome checks at 1440
and 320 pixels verified 11 metrics, current-filing labeling, historical P/E,
source-discrepancy caveats, served-file byte identity and no page errors.
Private notification files were unchanged across that read-only browser check.
The earlier full-suite baseline remains `3018fb5`; it was not rerun for this
limited source delta.

Required hosted CI remains an independent release condition. The predecessor's
three jobs still had no executed steps at recovery entry. No redundant rerun or
billing change was requested. The normal branch/preview pipeline is permitted;
main and production must remain unchanged until required exact-head checks pass.
Upstox remains parked pending Haji's explicit activation confirmation.
