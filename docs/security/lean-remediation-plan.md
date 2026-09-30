# LEAN dependency remediation plan

Atlas will not silently patch the ignored QuantConnect LEAN checkout. The current local dependency audit reports vulnerable legacy packages, so LEAN dependency safety remains a production blocker even while the Atlas golden fixture matrix passes.

Remediation procedure:
1. Pin the current known-good LEAN commit and archive the three Atlas golden outputs.
2. Fetch/evaluate an upstream LEAN revision or isolated security branch that removes or mitigates the vulnerable dependency paths while retaining the supported .NET runtime.
3. Build Release from a clean restore.
4. Run targeted brokerage/transaction tests plus all Atlas golden fixtures.
5. Re-run `dotnet list ... package --vulnerable --include-transitive`.
6. Reject the candidate on behavioral fixture divergence or unresolved production-relevant vulnerability exposure.
7. Only then update the Atlas-certified LEAN revision.

Passing behavioral fixtures alone does not waive dependency risk.
