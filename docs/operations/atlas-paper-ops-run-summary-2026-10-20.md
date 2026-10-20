# Atlas free operational monitoring — source-vs-job status

A green GitHub Actions job means that the scheduled virtual-paper script
finished safely and persisted/validated its status. A green job **does not**
mean the market source was accepted or that paper trades occurred.

The zero-dependency `scripts/paper_run_health.mjs` classifies each existing
virtual checkpoint:

- `SOURCE_VERIFIED_PAPER_ONLY`: bounded publicly timestamped source passed;
  **may still contain zero model fills**
- `SOURCE_REJECTED`: stale/unavailable/invalid market source; no fill
- `SKIPPED_SOURCE_INTERVALS`: one or more 2-hour bars were missed and can
  never be retroactively traded
- `VIRTUAL_RISK_HALTED`: at least one virtual portfolio is halted by its
  configured risk veto
- `SOURCE_NOT_INITIALIZED`: no eligible source-verified startup
- `SOURCE_STATUS_UNVERIFIED`: report lacks source acceptance evidence

Each GitHub run's **step summary** records the status, exact source reason,
last completed bar, source age at validation, delayed-only labeling,
number of virtual accounts, current risk halts, missed intervals and
**new modeled fills in that run only**. No previous fills are relabeled
as fresh and no broker transactions are implied.

Non-green research statuses cause a GitHub **warning annotation** but
still persist the failure safely as a completed runner attempt.
This preserves the distinction between source failure vs infrastructure
failure; it also avoids losing real failure evidence.

The runner does not read, send, email or SMS notifications, does not
trigger orders or authenticated APIs, and remains subject to GitHub's
best-effort schedule and free-tier quotas.

The owner's existing scheduled Atlas HAOR check can review run summaries
and alert on severe conditions; the GitHub annotation is **not itself**
a guaranteed push notification.

Only bounded source fields from the public virtual report enter the
summary. Each output is sanitized and verified by synthetic tests.

No provider API key, real-market trading or new paid service is involved.
Astra's research files remain untouched.
