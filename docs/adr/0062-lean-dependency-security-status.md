# ADR-0062 — LEAN dependency security status

**Status:** Accepted  
**Date:** 2026-09-27

A fresh `dotnet list QuantConnect.Lean.sln package --vulnerable --include-transitive` audit of the local LEAN checkout reports known vulnerabilities in transitive/top-level packages used across LEAN, including DotNetZip 1.16.0 (high), System.Drawing.Common 4.7.0 (critical), and older WinHttpHandler/ServiceModel packages (high/moderate in affected projects).

Atlas will **not** silently patch the independent LEAN checkout because dependency upgrades can change compatibility and simulation behavior. LEAN remains an isolated external engine and is not authorized as a live-capital boundary while these findings remain unresolved.

The Atlas Python dependency audit currently reports no known vulnerabilities. The actual Atlas LEAN golden fixture still passes independently; functional parity does not waive dependency/security gates.

Next safe action is compatibility testing of an upstream/fixed LEAN revision or isolated package-upgrade branch, followed by golden/backtest regression comparison before adoption.
