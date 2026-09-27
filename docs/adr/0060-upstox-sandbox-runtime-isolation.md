# ADR-0060 — Upstox Sandbox Runtime Credential Isolation

**Status:** Accepted  
**Date:** 2026-09-04

## Decision
Atlas loads the Upstox sandbox token only from `UPSTOX_SANDBOX_ACCESS_TOKEN` at runtime. The token is never placed in source, tests, durable state, order payloads, or logs.

A dedicated smoke harness defaults to dry-run. Network execution requires an explicit `--execute` flag plus an already-approved order, and the adapter is permanently restricted to the Upstox sandbox origin.

## Scope
This establishes a real sandbox integration path but does **not** create production credentials, production endpoints, or live trading authority.
