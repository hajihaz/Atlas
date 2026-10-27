# Atlas combined research candidate — 26 October 2026

This isolated candidate combines runtime PR #49 (d1a4914), read-only integrations
PR #51 (8ce9e87, including the quality warning change), and synthetic research
PR #50 (821b91d). Main and production remain unchanged.

Conflict resolution preserves both the hash-pinned runtime dependency install and
the optional integration extra in Python CI. Frontend dependencies retain exact
Lightweight Charts 5.2.1 and the web-push/browser tooling. IPO manual valuation
review and injected test clocks remain intact. Historical replay stays lazy.
The synthetic Day Trader panel is mounted in the actual ScalpStorm route inside
a separate collapsed sandbox; the authentic stock replay count stays 0/20.

Combined local acceptance:
- 720 Python tests and 85 subtests passed, no skips, with disposable PostgreSQL
  and existing archived LEAN fixtures. The temporary database was stopped and
  deleted; the fixture link was removed and original fixture hashes are unchanged.
- 476 JavaScript tests across 73 test files passed.
- Ruff, strict mypy (152 source files), TypeScript and production build passed.
- Four real Chromium checks passed: synthetic/source separation, quality warnings
  before modeled returns, missing-metadata fallback, and 320-pixel layout.
  These browser checks use explicitly synthetic QA responses, not market evidence.
- No browser writes, notifications, broker orders or owner-runtime changes.

New source observation audit: only checkpoints 31-34 after the previously closed
checkpoint 30 were audited. All 20 decisions match the independent strategy
implementation; source, code and committed ledger hashes match exact local input
receipts. No new modeled fills occurred. The original 1,860 paper fills, losses
and risk halts remain unchanged. Open positions and short observation remain
unqualified strategy evidence. No old checkpoint or deadline test was repeated.

Local OpenAlgo access is still unavailable: no OpenAlgo project or configured
observer key was found in the targeted current project environment; port 5000
belongs to macOS ControlCenter, not OpenAlgo. Atlas retains only its read-only
analyzer observer and never invokes the dual-use order endpoint.

Verification evidence is in .ai/raw/haor-consolidation-20261026/. The new paper
audit is retained separately in the existing runtime checkout, in the same raw
subdirectory. The initial combined Python bootstrap failure is preserved as a
failed attempt; the accepted rerun uses standard-library-first optional paths.
Adding whole existing site-packages directories ahead of stdlib is prohibited
because a legacy uuid package can shadow Python's standard library.

Draft publication and exact-head preview verification follow this local checkpoint.
Required hosted CI is still gated by exhausted included GitHub Actions minutes.
No billing changes, CI substitutions or live capital are authorized.
Authentic permitted NSE data, historical rights/PIT evidence, provider activation,
strategy qualification and production acceptance remain external gates.
Integration progress remains 71/100 under its existing weighted scope.

Publication checkpoint: draft PR52 is open. Commit9346be4 has a READY Vercel preview with authenticated root/API HTTP200. Its real-source Strategy Lab response contained719 public INR crypto candles and five hypothetical strategies, explicit unverified evidence, and zero real/paper order execution. A state-only checkpoint follows; its exact branch-tip proof is stored separately. Required hosted CI remains unsatisfied.
