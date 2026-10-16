#!/usr/bin/env python3
"""Run LEAN unit tests in separate processes; explicitly report Python.NET GIL blockers."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
from dataclasses import asdict, dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOTNET = ROOT / ".tooling/dotnet/dotnet"
PROJECT = ROOT / "Lean/Tests/QuantConnect.Tests.csproj"
SMOKE = (
    "ZipBytesReturnsByteArrayWithCorrectLength",
    "ZipStreamWriterTests.Create",
)
KNOWN_DIAGNOSTIC = ("CompressionTests.ReadLinesCountMatchesLineCount",)


@dataclass(frozen=True)
class IsolatedTestResult:
    test: str
    state: str
    exit_code: int
    log_file: str


def classify_lean_test_output(output: str, returncode: int) -> str:
    passed = re.search(r"Passed!\s+- Failed:\s*0, Passed:\s*1, Skipped:\s*0, Total:\s*1,", output)
    if returncode == 0 and passed:
        return "PASS"
    if "GIL must always be released" in output or "Python.Runtime.Py.GILState.Finalize" in output:
        return "BLOCKED_PYTHONNET_GIL"
    if "Skipped!" in output or "Skipped:     1" in output:
        return "SKIPPED"
    if "The active test run was aborted" in output:
        return "HOST_ABORTED"
    return "FAILED"


def run_cases(
    case_names: tuple[str, ...], *, log_dir: Path, nunit_single_worker: bool = False
) -> tuple[IsolatedTestResult, ...]:
    if not DOTNET.is_file() or not PROJECT.is_file():
        raise RuntimeError("LEAN test SDK or project unavailable")
    log_dir.mkdir(parents=True, exist_ok=True)
    observed: list[IsolatedTestResult] = []
    allowed = ("PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "TZ")
    runtime_env = {key: os.environ[key] for key in allowed if key in os.environ}
    runtime_env["DOTNET_ROOT"] = str(DOTNET.parent)
    test_binary = ROOT / "Lean/Tests/bin/Release/QuantConnect.Tests.dll"
    if not test_binary.is_file():
        raise RuntimeError(
            "LEAN isolated-test binary missing: build the LEAN Tests Release project first"
        )
    for case in case_names:
        if not re.fullmatch(r"[a-zA-Z0-9_.]+", case):
            raise ValueError("unsafe LEAN test identifier")
        cmd = [
            str(DOTNET),
            "test",
            str(PROJECT),
            "-c",
            "Release",
            "--no-build",
            "--no-restore",
            "--filter",
            f"FullyQualifiedName~{case}",
            "--logger",
            "console;verbosity=minimal",
        ]
        if nunit_single_worker:
            cmd.extend(
                ["--settings", str(ROOT / "scripts/lean-fixtures/nunit-single-worker.runsettings")]
            )
        try:
            result = subprocess.run(  # noqa: S603 - pinned executable and fixed args
                cmd, cwd=ROOT, env=runtime_env, text=True, capture_output=True, timeout=60
            )
            output = result.stdout + "\n" + result.stderr
            status = classify_lean_test_output(output, result.returncode)
            code = result.returncode
        except subprocess.TimeoutExpired as exc:
            output = (
                (exc.stdout or b"").decode()
                if isinstance(exc.stdout, bytes)
                else (exc.stdout or "")
            )
            status, code = "TIMEOUT", -1
        log = log_dir / f"{case}.log"
        log.write_text(output)
        observed.append(IsolatedTestResult(case, status, code, str(log.relative_to(ROOT))))
        print(f"  {status} {case}")
    return tuple(observed)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("smoke", "diagnostic"), default="smoke")
    parser.add_argument("--attempts", type=int, default=1)
    parser.add_argument("--nunit-single-worker", action="store_true")
    args = parser.parse_args()
    if not 1 <= args.attempts <= 20:
        parser.error("--attempts must be between 1 and 20")
    cases = SMOKE if args.mode == "smoke" else KNOWN_DIAGNOSTIC
    results = tuple(
        result
        for attempt in range(1, args.attempts + 1)
        for result in run_cases(
            cases,
            log_dir=ROOT / "artifacts/lean-test-isolation" / f"attempt-{attempt:02}",
            nunit_single_worker=args.nunit_single_worker
        )
    )
    report = {
        "mode": args.mode,
        "attempts": args.attempts,
        "nunit_single_worker": args.nunit_single_worker,
        "results": [asdict(item) for item in results],
    }
    path = ROOT / f"artifacts/lean-test-isolation-{args.mode}.json"
    path.write_text(json.dumps(report, sort_keys=True, indent=2) + "\n")
    failures = [item for item in results if item.state != "PASS"]
    if failures:
        print(
            f"LEAN isolated {args.mode}: BLOCKED "
            f"({len(failures)} of {len(results)} attempts failed; see {path})"
        )
        return 2
    print(f"LEAN isolated {args.mode}: PASS ({len(results)} processes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
