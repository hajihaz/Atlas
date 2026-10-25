# Dated issuer research and real deadline delivery audit

Atlas now joins a separate primary-filing review to the exact issuer ID, company,
board, opening date and closing date. The eight open/upcoming records reviewed on
25 October 2026 comprise seven current RHP/abridged-RHP reviews and one explicit
source gap (EAAA). The existing Paras financial record remains available separately.

The source catalog is `frontend/public/ipo-issuer-reviews.json`. Each cited file
has a canonical regulator, issuer or lead-manager URL, a SHA-256 fingerprint and
physical PDF page numbers. Source PDFs and extracted full text are not committed.
No social-media statement is used as financial evidence.

| Issuer | Evidence and material accounting distinction |
| --- | --- |
| BLS Polymers | SEBI abridged filing and full RHP; lakh-to-crore conversion; operating cash flow is cited to the full financial statement. |
| SFC Environmental Technologies | SEBI abridged filing; consolidated figures; net debt/equity is distinct from gross debt/equity. |
| Core4 Engineers | Issuer-hosted RHP; consolidated facts, working-capital cycle and dated K2 Infragen peer context. |
| Wiscon Industries | Lead-manager RHP; FY26 consolidated figures and earlier standalone periods are not treated as like-for-like organic growth. |
| Carver Roboweld | Lead-manager RHP; this view uses standalone facts and EPS. The different consolidated EPS is identified as a valuation-basis gap. |
| Bombay Coated and Special Steels | Lead-manager abridged filing and issue-price basis; the disclosed BMW price, EPS and P/E do not fully reconcile and are flagged. |
| M.K. Sons Fine Jewels | Current 22 October RHP retrieved from its lead manager; older draft figures are superseded in this view. |
| EAAA India Alternatives | Current financial evidence withheld. The issuer's RHP distribution confirmation was not accepted, and an ordinary annual-report request failed. |

Lakh values divide by 100 and million values by 10 to obtain INR crore. Quarterly
figures are not annualized. The displayed P/E scenario divides a fresh publisher
price band by historical annual diluted EPS. It uses the explicitly labeled
accounting basis before the offer; it is neither post-offer diluted EPS nor
independently verified fair value. A stale price observation, changed offer
identity, nonpositive EPS, wrong fiscal period or draft-only evidence suppresses it.

Peer ratios remain issuer-reported observations at their disclosed market dates.
They are not current market prices or independently verified comparable valuations.
All reviewed issuers retain HOLD for manual valuation/risk review. The IPO
briefing CLI exposes the same context, keeps demand freshness separate from
calendar freshness, and respects an earlier verified bid cutoff.

## Deadline receipt semantics

Real deadline pushes now carry their own random receipt ID and a separate
256-bit proof in the encrypted push payload. Only the proof hash is persisted.
Read-only polling cannot confirm a notification.

The owner-local audit distinguishes reservation, provider acceptance, browser
display and an actual click. Browser display is not proof that the owner saw an
OS banner. The existing test receipts remain separate and unchanged; a successful
test does not certify a real calendar event.

The sender reserves events before network I/O, releases the private lock while
sending, and merges transport outcomes without overwriting an earlier device
acknowledgement. Unknown outcomes are not blindly resent. The service worker
retries only the same idempotent acknowledgement, with a fixed bound. Deadline
proofs expire after 48 hours; test proofs retain their 10-minute expiry.

The audit endpoint is owner-local `GET /api/ipo-push?audit=deadline`; its response
omits subscriptions, device IDs, private keys, proof hashes and receipt proofs.
The existing cloud push route remains unavailable. No new real deadline event
was eligible on 25 October; Core4's reported 27 October close first enters the
T-1 calendar window on 26 October, subject to fresh evidence and the Mac sender
remaining online.

## Verification

- 628 Python tests and 61 subtests passed; 10 environment-dependent skips remain.
- 445 Node tests passed, including early receipt-before-provider-response,
  reservation deduplication, receipt expiry, exact offer identity and malformed
  financial evidence.
- Ruff, strict mypy and the TypeScript/production build passed.
- Actual local Chrome checks passed at 1440, 768, 390 and 320 pixels, with no
  page errors or failed local requests. The audit route was checked after the
  owner server reload.
- VAPID keys, subscriptions and the existing test-receipt file were byte-for-byte
  unchanged across that reload.
- PDF inspection used an isolated hash-pinned pypdf 6.21.2 reader; its dependency
  audit reported no known vulnerabilities. Critical source tables were rendered
  and visually checked.

Hosted CI and production release are separate acceptance gates. Local passing
tests do not clear them.
