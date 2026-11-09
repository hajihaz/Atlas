# Repo hygiene follow-ups (owner decisions)

**Status:** Open · **Date:** 2026-11-08 · **Owner:** hajihaz · **Related:** PR #58, PR #52, PR #54, PR #56, PR #57

Items from the 2026-11-08 repository review that were not applied automatically because they need an owner decision, touch other open PRs, or could not be verified safely. Nothing here changes trading, risk or data behavior.

## 1. Close superseded PRs
PRs #49, #50 and #51 state in their descriptions that they are integrated into consolidated draft PR #52. Close them with a pointer to #52. Their branches can stay so they remain reopenable. (An attempt to do this automatically was denied by a permission check, so it is left to the owner.)

## 2. Re-base or re-target stale PRs
PRs #47 and #49 to #54 target `56a4095`, but `main` is now `a4f2e5b`. PR #48 is stacked on #47's branch (`haor/atlas-consolidated-20261023`), not on `main`. After deciding which PRs survive, rebase or re-target them and re-run CI. Hosted CI was blocked by the exhausted Actions quota in late October; PR #57 shows it passing on 2026-11-08, so reruns should now be possible.

## 3. Reconcile conflicting strategy scope
PR #54 makes ScalpStorm X the sole active strategy. PR #56 adds a three-way 15-session challenge that includes an "Original Atlas" book and a rules comparator. Decide which direction governs before either merges.

## 4. Close the data and forward-evidence gaps first
The release blockers repeated across PRs are the same two things: no rights-cleared NSE data feed, and no completed forward paper sessions (NSE certification is 0/20). New features add more to certify without closing these.

## 5. Add a post-deploy smoke test (after PR #57 merges)
PR #57 exists because `/api/cloud-paper` returned 404 on the deployed `main` while Vercel reported READY. Add a workflow on `deployment_status` that requests the key public routes (for example `/api/cloud-paper?action=status`, expecting 200 with `mode: PAPER_ONLY` and `realOrdersEnabled: false`) and fails if any returns 404. Not added here because the route does not exist on `main` yet and the check could not be exercised.

## 6. `.ai/` is tracked and the repo is public
`AGENTS.md` instructs agents to load `.ai/HAO_POLICY.json` and `.ai/HANDOFF.md`, so the directory is part of the owner workflow and was left in place. Removing it through the GitHub API would delete the local copies on the next pull. If it should be private, run locally: `git rm -r --cached .ai && printf '.ai/\n' >> .gitignore`, then commit. Only `.ai/BLOCKERS.md` was read in this review; review the other files before deciding.

## 7. Confirm `atlas-golden-decision.json`
A 133-byte root file with contract `atlas.lean.decision.v1` (SPY, 2013-10-07). It looks like a LEAN adapter fixture. GitHub code search was inconclusive, so it was not removed. Confirm references, then move it under `lean-adapter/` fixtures if only used there.

## 8. `CLAUDE.md` is out of date with the README
`CLAUDE.md` section 1 says only the Phase 2 data layer exists and section 3 says not to build strategies, backtesters, brokers or dashboards. The README (verified 2026-11-07) documents all of these as implemented. Section 6 also calls `backend/` and `frontend/` reserved and empty. Reconcile through an ADR or an explicit owner edit; this is a governance document, so it was not edited here.

## 9. Prune stale branches
Candidates to check for merged or superseded work: `feat/atlas-ipo-application-research-20261023`, `feat/atlas-ipo-chat-report-20261023`, `feat/atlas-ipo-intelligence-20261023`, `feat/atlas-ipo-primary-financials-20261023`, `feat/agent-council-20261020-mobile`, `audit/upstream-trading-frameworks-20261020`, `astra/atlas-advanced-research-engine`, `astra/atlas-nse-data-certification-20261023`. Keep `data/atlas-runtime`. Verify each is fully reachable from `main` or an open PR before deleting.
