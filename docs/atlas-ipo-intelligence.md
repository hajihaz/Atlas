# Atlas IPO Intelligence — verified initial release (23 October 2026)

## Production boundaries

- **No application submission, broker connection, or funds movement.** Public frontend is read-only market research. Application status is manual, device-local and may be inaccurate; registrar/broker verification is required.
- Two official discovery surfaces: NSE public IPO listings/detail responses (Mainboard, plus SME when emitted) and the BSE SME Public Issues page (recent SME offerings). Never infer that lack of NSE SME records means no SME offerings exist.
- **Partial BSE outage recovery:** The collector retains recent previously verified SME rows (up to 7 days old), records their original `sourceObservedAt`, marks `sourceStale=true`, clears cached subscription/GMP and labels coverage as stale. Recovery does not imply the issue remains open or that old demand is current. The original source must be rechecked before action. Source references older than the retention window expire.
- Market data is an **observed snapshot**, not second-level live exchange data. `generatedAt` provides provenance. The frontend labels observations older than three hours **STALE** and refuses current-data recommendations.
- **SEBI primary financial research (one verified issuer initially):** `frontend/public/ipo-primary-research.json` contains manually transcribed FY2026 restated consolidated issuer figures for Paras Healthcare from SEBI-hosted abridged prospectus PDF pp. 8–10 and key issuer-disclosed risks pp. 14. The read-only UI attaches them only if exchange symbol, board and legal company name match exactly. It shows official document, source pages, debt, cash flows, historical losses and risks. It expressly withholds Apply and score until independent peer valuation and risk review. This single-issuer proof of evidence cannot be treated as automatic full-issuer coverage; formal source extraction is an open gate.
- Application planner (Mainboard retail capped at ₹2 lakh; SME individual category) uses the verified upper issue-price band, lot quantity and an owner-supplied budget to illustrate blocked capital and ±10% listing outcomes; no predicted gain, odds manipulation or brokerage order. SME indicative minimum enforces at least 2 lots strictly above ₹2 lakh, pending broker/category confirmation.
- A bounded optional Google News RSS headline index for open/upcoming issues filters publishers, issuer names, dates and trusted HTTPS links. It stores only titles and attributions, not article content; **journalistic headlines are not facts verified by Atlas**.
- GMP readings now come from the explicitly reusable **GMP Today (CC BY 4.0)** sample and **Xflot** attribution-required API, matched strictly to exchange issues and date, with provenance, cross-provider dispute flag and freshness. GMP remains unregulated/unverified by exchanges. Valuation, audited issuer risk scoring, allotment status and issuer news remain **unverified/unconnected** until properly sourced. Missing values are null rather than zero. No positive Apply score is emitted without independent fundamentals and a defensible valuation/RHP risk review.
- Scheduled source fetch and GitHub deployment are **best effort**, subject to uptime, public data access and exchange data licensing/terms. The scraper does not bypass bans, throttles, cookies or paywalls. Verify data-reuse permission before scaling public distribution.
- NSE + BSE source URLs are visible from each issue. Exchange-specific UPI deadlines are recorded only if the issuer detail publishes an explicit timestamp. General SME exchange 16:00 bid/17:00 mandate rules are informational, not substituted for exact issuer/broker deadlines.

## Files

- `scripts/update_ipo_feed.py` validates exchanges and produces `frontend/public/ipo-feed.json` atomically, with attributed unofficial GMP, verified issuer RHP/registrar links and optional third-party history; keeps previous verified copy on top-level failure. `frontend/public/ipo-accuracy.json` is a separately labeled, third-party, self-reported historical accuracy audit licensed CC BY 4.0.
- `.github/workflows/atlas-ipo-feed.yml` tests, updates and publishes snapshots at best-effort scheduled intervals. Conflicting pushes abort rather than overwrite other work.
- `frontend/src/components/IPOIntelligencePage.tsx`, `frontend/src/lib/ipoIntelligence.ts` implement filters, research details, math for indicative minimum bids, conservative guidance and local application tracking.
- `tests/unit/test_ipo_feed.py` covers parsing, source accuracy, unexpected schema and no-fabrication scenarios.
- `scripts/ipo_chat_report.py` creates an auditable Markdown or JSON briefing from the verified local NSE/BSE snapshot, exact-matched SEBI primary research and stamped unofficial GMP observations; for ChatGPT-facing analysis run `python3 scripts/ipo_chat_report.py` or pass `--json`. Missing/stale data triggers HOLD rather than an Apply signal. No broker/order path. `tests/unit/test_ipo_chat_report.py` covers source freshness, issuer matching, bid status, and stale GMP. The script is not a separately authenticated ChatGPT app plugin; ChatGPT can inspect its output using HHC. 

## Alerts

- Browser alerts are **permission-based** and only evaluated while Atlas is open; they do not guarantee background delivery.
- A separate ChatGPT condition-watch automation checks official NSE/BSE closing dates twice daily for the owner. It is not a generic multi-user notification service.
- A true multi-device background push/email implementation requires subscriber identity, secure opt-in data storage, a compliant delivery transport and integration tests.

## Run

```bash
python3 -m unittest discover -s tests/unit -p 'test_ipo_feed.py' -v
python3 scripts/update_ipo_feed.py
cd frontend && npm ci && npm run build
```

## Pending acceptance gates

1. Verify the updated fallback coverage GitHub Actions run, Git-triggered Vercel deployment and browser smoke test on live domain.
2. SME live subscription/lot-size enrichment beyond currently visible BSE issues.
3. Independent publisher-level claim verification, official issuer updates beyond headline discovery and richer news-scoring provenance. GMP is integrated as unofficial research, not an exchange-verified signal.
4. Scale validated prospectus/P&L ingestion to all issuers, review issuer facts against full RHP and audited restatements, calibrate peer valuation, governance and Apply/Watch/Avoid outcomes. One manually sourced issuer proof is live but broad automation remains pending.
5. Historical IPO/listing performance and registrar-confirmed allotment workflow, optional brokerage integration only with new owner approval.
6. Reliable account-backed notifications and status sync beyond device-local browser and scheduled owner watch.
