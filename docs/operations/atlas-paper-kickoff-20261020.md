# Atlas one-time source-verified paper kickoff — 20 October 2026

This file is a **single-use GitHub Actions push trigger**. The existing
`.github/workflows/atlas-paper-scheduled.yml` also has a best-effort two-hour
schedule and manual dispatch. This marker's first merge to main should generate
one additional push event; only edits to this exact marker trigger the extra
push event. The worker's paper-only risk checks and source gating are unchanged.

**No broker connection, real-money execution, paid services or historical
backfilled fills.** A failed source observation writes only a truthful
`AWAITING_VALID_SOURCE` attempt journal; a valid completed 2h candle and fresh
public quote may start the five synthetic portfolios at the actual observation.
Results must be verified from GitHub Actions job logs, the GitHub main snapshot
and the production `/cloud-paper.json` endpoint before declaring success.

After a verified first kickoff (or an observed fail-closed attempt), remove
the special `push.paths` trigger from the workflow, leaving the existing
`schedule` and `workflow_dispatch` unchanged. Do not touch this marker again.
