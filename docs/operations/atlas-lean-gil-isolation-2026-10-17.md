# Atlas: LEAN Python.NET GIL reliability — isolated diagnosis, 17 Oct 2026

## Scope and safety

This task is test-host reliability research only. Do **not** use it to enable
real trading. The Atlas read-only dashboard, authority policies, external LEAN
checkout, brokerage accounts and live-capital blocks remain unchanged.

## Reproduction and evidence

Target: `CompressionTests.ReadLinesCountMatchesLineCount` in the pinned LEAN
NUnit Tests assembly, with .NET 10, an isolated `dotnet test --no-build
--no-restore` host per attempt and the NUnit `NumberOfTestWorkers=0` setting.

- Earlier default runner: **1/5 GIL-finalizer crashes**.
- Earlier single-worker runner: **1/20 GIL-finalizer crashes**.
- Controlled 17 Oct probe: a **temporary** `Lean/Data/equity/sgx/map_files`
  fixture directory and a synthetic `atlas_test_only_map.csv` were created
  for the experimental subprocesses. The command cleaned them up after the
  run. **17/20 tests passed and 3/20 crashed**.
- In the controlled probe, attempts **11 and 17** reported a missing OANDA
  map directory alongside the finalizer exception; attempt **15** crashed
  without a missing-directory error. Therefore, satisfying the SGX fixture
  did **not** eliminate the GIL failure and the directory warning alone is
  **not** a sufficient causal explanation.
- Fatal signature: `System.InvalidOperationException: GIL must always be
  released` from `Python.Runtime.Py.GILState.Finalize()`.
- Exact ignored local evidence: `artifacts/lean-gil-sgx-probe-20261017/`
  with `attempt-01.log` through `attempt-20.log` and `report.json`.
- LEAN's standalone, archived **eight golden algorithm fixtures continue to
  be separately valid**; they are **not** a replacement for comprehensive
  NUnit host reliability.

An upstream LEAN community discussion describes the same SGX map-directory
and Python.NET finalizer symptoms:
https://www.quantconnect.com/forum/discussion/19201/lean-solution-tests/ .
The Python.NET source itself makes unreleased GIL handles a fatal finalizer
error:
https://github.com/pythonnet/pythonnet/blob/master/src/runtime/Py.cs .
These references support further diagnosis, not a verified local fix.

## Reliability tooling hardening completed

`scripts/lean_test_isolation.py` now:

1. Classifies GIL exceptions, test-host aborts or skip evidence **before**
   attempting to accept a passing test summary.
2. Requires a single exact passing result and exit code zero.
3. Saves each invocation and each attempt in an **immutable, unique** directory
   `artifacts/lean-test-isolation-runs/<run-id>/` (auto-generated run ID unless
   explicitly supplied). Reusing `--run-id` fails instead of overwriting
   historical crash evidence.
4. Writes private `0600` log and report files. The process receives only a
   small allowlist of environment variables, not user secrets.

Verified smoke command:

```sh
/opt/homebrew/opt/python@3.11/bin/python3.11 scripts/lean_test_isolation.py \
  --mode smoke --attempts 1 --nunit-single-worker \
  --run-id atlas-smoke-20261017-1644
```

Result: **two isolated LEAN tests passed**, a second invocation with the
same run ID exited nonzero, and all initial logs remained intact.

## Still blocked

The GIL finalizer crash remains intermittent. It is a known upstream runtime
failure mode and this investigation does **not** certify all LEAN NUnit tests.
Further investigation may compare pinned Python.NET runtime versions or LEAN
test assembly initialization in disposable checkouts, but such work requires
new independent evidence. No undocumented GIL-disabling flags, fake test
results or production-data mutations may be used to bypass this gate.

**LIVE-CAPITAL TRADING: BLOCKED.** No real broker orders or credentials used.
