# ADR-0064: Evidence-backed live-readiness inputs

Status: Accepted

Internal Atlas readiness signals are derived from typed evidence instead of accepting a collection of arbitrary booleans at the orchestration boundary. Strategy/paper readiness derives from the promotion verdict; monitoring readiness requires a fully healthy operational report.

The evidence adapter deliberately cannot set production broker selection, credential isolation, compliance review, human authorization, or governance live mode. Those remain independent external/owner gates. This prevents an offline certification path from accidentally manufacturing live-capital authorization.
