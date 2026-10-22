# Atlas IPO Intelligence — verified initial release (23 October 2026)

## Production boundaries

- **No application submission, broker connection, or funds movement.** Public frontend is read-only market research. Application status is manual, device-local and may be inaccurate; registrar/broker verification is required.
- Two official discovery surfaces: NSE public IPO listings/detail responses (Mainboard, plus SME when emitted) and the BSE SME Public Issues page (recent SME offerings). Never infer that lack of NSE SME records means no SME offerings exist.
- Market data is an **observed snapshot**, not second-level live exchange data. `generatedAt` provides provenance. The frontend labels observations older than three hours **STALE** and refuses current-data recommendations.
- GMP readings now come from the explicitly reusable **GMP Today (CC BY 4.0)** sample and **Xflot** attribution-required API, matched strictly to exchange issues and date, with provenance, cross-provider dispute flag and freshness. GMP remains unregulated/unverified by exchanges. Valuation, audited issuer risk scoring, allotment status and issuer news remain **unverified/unconnected** until properly sourced. Missing values are null rather than zero. No positive Apply score is emitted without independent fundamentals and a defensible valuation/RHP risk review.
- Scheduled source fetch and GitHub deployment are **best effort**, subject to uptime, public data access and exchange data licensing/terms. The scraper does not bypass bans, throttles, cookies or paywalls. Verify data-reuse permission before scaling public distribution.
- NSE + BSE source URLs are visible from each issue. Exchange-specific UPI deadlines are recorded only if the issuer detail publishes an explicit timestamp. General SME exchange 16:00 bid/17:00 mandate rules are informational, not substituted for exact issuer/broker deadlines.

## Files

- `scripts/update_ipo_feed.py` validates exchanges and produces `frontend/public/ipo-feed.json` atomically, with attributed unofficial GMP, verified issuer RHP/registrar links and optional third-party history; keeps previous verified copy on top-level failure. `frontend/public/ipo-accuracy.json` is a separately labeled, third-party, self-reported historical accuracy audit licensed CC BY 4.0.
- `.github/workflows/atlas-ipo-feed.yml` tests, updates and publishes snapshots at best-effort scheduled intervals. Conflicting pushes abort rather than overwrite other work.
- `frontend/src/components/IPOIntelligencePage.tsx`, `frontend/src/lib/ipoIntelligence.ts` implement filters, research details, math for indicative minimum bids, conservative guidance and local application tracking.
- `tests/unit/test_ipo_feed.py` covers parsing, source accuracy, unexpected schema and no-fabrication scenarios.

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

1. Verify GitHub Actions scheduled job run + successful new production Vercel deployment and browser smoke test on live domain.
2. SME live subscription/lot-size enrichment beyond currently visible BSE issues.
3. Additional independent news and issuer-specific primary disclosures with freshness, archive, discrepancies and scam filters. GMP is integrated as unofficial research, not an exchange-verified signal.
4. Prospectus/P&L/peer valuation ingestion, source-backed audit, score calibration, governance red flags and Apply/Watch/Avoid decision verification.
5. Historical IPO/listing performance and registrar-confirmed allotment workflow, optional brokerage integration only with new owner approval.
6. Reliable account-backed notifications and status sync beyond device-local browser and scheduled owner watch.
