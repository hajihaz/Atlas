# Atlas free cloud capture — stage 1

This is a small first migration slice: a Google Apps Script time trigger captures Upstox's public NSE MIS and BOD instrument catalogues to the owner's private Google Drive. It preserves the exact gzip source bytes, validates dated source timestamps and normal NSE_EQ identities, and writes a derived MIS roster with hashes. It does not contain market prices, 09:40 snapshots, strategy evaluations, paper fills, or broker order calls.

## $0 and privacy boundary

- Uses Google Apps Script's consumer free quotas and the account's existing Drive storage. It does not create or link a billable Google Cloud project, call billing APIs, enable overage, or request an upgrade.
- The script checks Drive storage headroom before publishing archive files. If capacity is insufficient, the capture fails closed. It does not delete old data to make space.
- Keep the Apps Script project and Drive folder private. The code contains no share/public-access operation and no web app deployment.
- Do not paste a card, OTP, brokerage credential, or token into this project. No broker API is used.
- Cloudflare Workers and billing settings are untouched. Apps Script is a separate free-quota path for the heavier premarket reference capture.
- Do not associate a standard Google Cloud project or enable billing. If Google presents any payment, upgrade, billing, or paid-plan screen, stop and close it.

Google's current Apps Script documentation lists a 6-minute per-execution runtime, 90 minutes/day of trigger runtime for consumer accounts, 20 triggers per script, and 20,000 URL Fetch calls/day. Reaching a quota stops the execution with an error; it does not automatically upgrade the account. These limits may change. This workload currently uses two GET calls on an open NSE session. The time trigger is approximate, not an exact 07:10 cron.

## Project contents

- `Code.gs`: capture, validation, immutable receipt verification, Drive storage guard, and approximate daily trigger setup.
- `appsscript.json`: timezone, V8 runtime, and explicit OAuth scopes.

The script requires three explicit scopes: full Drive access (to find the existing private archive folder and write/read its receipts), external HTTP requests (Upstox public catalogues), and installable trigger management. Review these scopes at the authorization screen. The trigger runs as the Google account that creates it.

## Owner step needed to activate it

The standalone project already contains the candidate `Code.gs` and explicit `appsscript.json`. Its Project Settings page showed **GCP Default**; no standard Google Cloud project or billing account was linked.

1. Open [Atlas Free Market Archive](https://script.google.com/home/projects/1OOwyV6mchbTBrhkRFGNOAmHPgS1YaMNV5cn48QWmoqC2lmDfeazefBvy/edit).
2. Select `atlasInstallPremarketTrigger` and click Run. Google will show the requested Drive, external HTTP request, and trigger-management permissions. Review and authorize them yourself; I cannot approve this access prompt for you.
3. Verify the Triggers page shows exactly one daily `atlasCapturePremarket` trigger. The time is approximate, and the Mac can be offline while Google's trigger runs.
4. To get today's first cloud receipt, run `atlasCapturePremarket` manually only before 09:15 IST on an NSE session day. Verify `CAPTURED` and the three manifests in the private dated Drive folder. If Google shows any payment, upgrade, or billing screen, stop.

The account owner must grant the three scopes before a trigger or capture can run. If authorization is not granted, no cloud execution occurs. On failure, inspect the execution error and fix its cause without weakening the identity, timestamp, size, storage, or sharing checks.

## Deliberate scope limits

- This is not the complete Atlas cloud migration. It is not 09:40 market data, a backtest, paper order execution, or a continuously connected ChatGPT MCP.
- No strategy code is migrated in this slice. Real brokerage orders remain disabled.
- Cloudflare Workers Free currently limits each invocation to 10 ms CPU; large archives and reconciliation should not be placed in that Worker. The existing paper Worker is unchanged.
- NSE's research data list includes public bhavcopy/historical reports; NSE's general policy restricts redistribution except where an agreement permits it. Keep any archive private and do not redistribute it. Upstox instrument catalogues are also retained privately for this project only.

## Evidence and status

- Private Drive archive root `Atlas Private Market Archive` was created and its current sharing state was verified as not shared.
- The dated local-import subfolder contains six 2026-10-29 source/manifest/CSV files; uploaded byte sizes matched the local files. Connector readback confirmed the files are private. The raw Drive byte hash has not yet been independently recomputed.
- The standalone project [Atlas Free Market Archive](https://script.google.com/home/projects/1OOwyV6mchbTBrhkRFGNOAmHPgS1YaMNV5cn48QWmoqC2lmDfeazefBvy/edit) now has the candidate `Code.gs` and explicit manifest saved. Project settings show GCP Default and no linked standard project/billing. OAuth is not approved, no trigger is installed, and no Apps Script capture has succeeded. The installer is currently stopped at Google's Authorization required dialog; a prior attempt was cancelled before consent. No scope has been granted and no capture has run.
- The 2026-10-29 local pipeline and its hashes are documented in the current Atlas handoff. Historical archives/backtests and real-time paper-session verification remain separate outcomes.

End-to-end Atlas outcomes: `░░░░░░░░░░░░░░░░░░░░ 0/5 verified` — candidate setup and data storage are supporting work, not proof of cloud operation or strategy performance.

Sources:
- Google Apps Script quotas: https://developers.google.com/apps-script/guides/services/quotas
- Google Apps Script installable triggers: https://developers.google.com/apps-script/guides/triggers/installable
- Google Apps Script authorization scopes: https://developers.google.com/apps-script/guides/services/authorization
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- NSE data sharing policy: https://www.nseindia.com/static/market-data/nse-data-policy
- NSE data list for research and analysis: https://nsearchives.nseindia.com/web/sites/default/files/inline-files/Data%20list%20under%20NSE%20Data%20Sharing%20Policy%20for%20Research%20and%20Analysis_20250728.pdf

hao • active | haor • owner gate
