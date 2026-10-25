# Owner Mac research publication

Atlas keeps paper research running at zero additional spend while hosted Actions availability is exhausted. This is a data publisher for the reviewed preview. Main, production, all required hosted checks and all risk stops retain their release gates.

## Data and attribution

The calendar uses the documented [Xflot API](https://www.xflot.com/api-docs). Every snapshot carries its response disclaimer and links to Xflot. Successful responses are cached for one hour; unsuccessful attempts reserve a minimum 60-second retry interval. The adapter makes one list request, with no per-issuer request burst.

Only dated, non-conflicted publisher records in the declared window appear. Social/debt indicators, series-style symbols without an equity lot, and sub-rupee/unit-ambiguous prices are conservatively quarantined until primary equity terms are confirmed. This is a source-quality filter, not a legal assertion about an issuer. Counts of excluded, undated, conflicted and out-of-window records are included. Coverage describes tracked Mainboard/SME records and does not claim exchange-certified completeness. NSE website collection remains disabled.

[GMP Today](https://gmptoday.in/api/) supplements exact company/board/closing-date matches under CC BY 4.0. Its API is explicitly a three-issue sample. Calendar observation time, publisher modification time, demand timestamp and GMP timestamp remain separate. Missing values stay null; neither bid/UPI cutoffs nor allotment/listing dates are inferred. All research decisions remain subject to prospectus, financial and valuation checks.

## Local and preview paths

- The owner dashboard at http://127.0.0.1:4300 reads validated private runtime snapshots through GET-only fixed paths.
- The Mac publisher caches IPO data for one hour and the existing public, virtual BTCINR checkpoint after completed two-hour candles, with a five-minute settlement grace. Missed intervals remain explicit and do not create retroactive fills. It wakes every five minutes, admits checkpoints only inside the existing freshness window, and permits at most three bounded source-failure attempts per window. Unchanged artifact digests do not generate new commits.
- The exact reviewed code SHA is pinned in a private approval record. Changes to tracked application files stop publication until verification and installation are repeated.
- A separate orphan branch, `data/atlas-runtime`, contains exactly two public research JSON snapshots, a publication manifest and two Vercel configuration files. It contains no application source, workflow, Mac ledger, account token, VAPID key or device subscription.
- Vercel deployments are disabled on that data branch. Only the reviewed preview reads the branch using the existing server-only, repository-scoped read token. Production continues to read main.
- Push intent is journaled before network I/O. An uncertain result is reconciled against origin; a retry uses the same candidate commit, and divergence stops safely.
- The Mac must be awake, online and signed into the user session. Source timestamps remain visible when it is unavailable; HTTP response time never renews financial evidence.

The report branch does not create CI check results, release application code or authorize any order. The existing two Mac comparison accounts, their losses and their drawdown latches remain unchanged.

## Notifications

Safari uses the existing private VAPID key and subscription. An explicit test has three distinct stages: push-service acceptance, browser display and actual notification click. A random receipt capability travels only inside encrypted push data; the public polling ID cannot fabricate a receipt. macOS visibility is independently observed during acceptance.

The real test labelled `3CEA25` reached Notification Centre on 25 October 2026. Clicking it produced an authenticated callback at 05:51:20 UTC. This proves the tested Mac delivery path; other devices need their own permission/subscription.

Deadline reminders use fresh dated records, a per-device reservation journal and calendar-date wording that asks the owner to verify issuer/broker cutoffs. The Mac sender must remain online. No application or payment is initiated.

## Operations and recovery

Verify and commit changes, then install the reporter with:

```sh
.venv-runtime/bin/python scripts/public_report_publisher.py --install VERIFIED_COMMIT_SHA
```

The user LaunchAgent is `com.hajihaz.atlas.report-publisher`. Health and journals live in the private runtime directory. To stop it reversibly:

```sh
launchctl bootout gui/$(id -u)/com.hajihaz.atlas.report-publisher
```

The legacy hosted paper and IPO publication workflows may be disabled only after the Mac publisher is verified. Required Python, UI and NSE certification workflows stay enabled. Re-enable a legacy publisher explicitly if its documented source and quota prerequisites are restored.

## Remaining release and research gates

GitHub confirmed that the account used all 2,000 included Actions minutes, with reset on 1 November 2026. No spending increase, paid upgrade or CI workaround is configured. The application PR stays draft until exact-head hosted checks run and pass.

ScalpStorm remains 0/20 certified sessions because authentic point-in-time NSE universe/minute data and intended-use evidence are absent. Seven recorded crypto days do not establish strategy profitability. The existing risk-halted accounts are never reset to make progress appear better.
