## Summary
<!-- 2-4 sentences: what changes and why. Keep status logs and long evidence in docs/, not here. -->

## Verification
<!-- Commands run and their results (tests, lint, typecheck, build). Link CI runs rather than pasting logs. -->

## Safety checklist
- [ ] No real-money trading path enabled or weakened (`ATLAS_EXECUTION_MODE` stays `PAPER_ONLY`)
- [ ] No secrets, tokens or private ledgers committed
- [ ] Safety constraints strengthened only; any weakening has a ratified ADR
- [ ] No fabricated market data, fills or returns

## Release gates
<!-- Link the tracking issue for any external gate (data rights, CI, deploy acceptance) instead of describing it here. -->

## Related
<!-- Superseded/stacked PRs, issues, ADRs. If this PR supersedes another, say so and close the old one. -->
