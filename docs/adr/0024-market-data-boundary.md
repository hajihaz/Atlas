# ADR 0024 — Market-Data Admission Boundary

**Status:** Proposed · 2026-09-03

Atlas admits market data only through explicit point-in-time snapshots with freshness metadata. A snapshot observed after the decision timestamp is invalid; stale data is fail-closed. Vendor adapters remain outside strategy and execution logic.

## Required evidence
- snapshot identity/content digest
- knowledge/as-of timestamp
- source lineage
- freshness status
- data-quality result

No broker connectivity is permitted through the data boundary.
