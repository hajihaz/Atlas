# ADR 0026 — Independent Risk Gate

**Status:** Proposed · 2026-09-03

Risk is a pure, separately testable veto boundary. It may approve, reduce, or block a proposed target, but cannot increase exposure. It checks gross exposure, single-name concentration, data freshness, equity floor and kill-switch state.

Risk has no dependency on broker connectivity and cannot submit orders. Any uncertainty results in rejection. Automated components cannot override a risk veto.
