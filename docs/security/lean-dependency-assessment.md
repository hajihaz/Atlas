# LEAN dependency security assessment — 2026-09-30

Scope: the local QuantConnect LEAN checkout used by Atlas certification. This assessment does not modify upstream LEAN dependencies.

`dotnet list Lean/QuantConnect.Lean.sln package --vulnerable --include-transitive` reports vulnerable packages in the current graph, including DotNetZip 1.16.0 (high), System.Drawing.Common 4.7.0 (critical), System.Net.Http.WinHttpHandler 4.4.0 (high), and System.Private.ServiceModel/System.ServiceModel.Primitives 4.4.0 (high/moderate advisories). The command exits non-zero, so Atlas must not treat the LEAN dependency posture as production-cleared.

Decision: do not perform blind package upgrades inside the external LEAN checkout. Atlas golden certification proves behavioral compatibility of selected fixtures, not dependency safety. Production readiness remains blocked until a controlled upstream update or isolated patched fork removes or mitigates vulnerable dependency paths and the full Atlas LEAN fixture matrix is rerun.

Current containment: LEAN is not Atlas's governance authority; Atlas keeps broker-write authority isolated, live capital disabled, and external checkouts out of the parent repository. This reduces exposure but does not erase dependency risk.
