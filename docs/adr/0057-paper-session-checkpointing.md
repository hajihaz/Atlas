# ADR-0057 — Crash-Safe Paper Session Checkpointing

**Status:** Accepted  
**Date:** 2026-09-04

## Decision
Paper sessions are checkpointed before and after each cycle through `StateStore`. State writes use a temporary file, flush + fsync, atomic replacement, restrictive `0600` permissions, and a parent-directory fsync. An unreadable or overly-permissive checkpoint fails closed.

A failed cycle remains `running`; it is not reported as completed. The checkpoint is operational evidence only and does not authorize live capital.

## Boundary
`PaperSessionRunner` can orchestrate synthetic paper execution and durable local state. It cannot select a production broker, obtain production credentials, or place a live order.
