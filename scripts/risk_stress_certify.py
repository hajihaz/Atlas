#!/usr/bin/env python3
"""Fail closed on synthetic risk stress divergence."""

from atlas.risk.stress_certification import run_risk_stress


def main() -> int:
    report = run_risk_stress()
    if not report.passed:
        print("ATLAS RISK STRESS: BLOCKED")
        for case in report.cases:
            if not case.passed:
                print("  ", case.name, case.observed)
        return 2
    print(
        f"ATLAS RISK STRESS: PASS ({len(report.cases)} deterministic synthetic "
        f"scenarios; sha256={report.evidence_hash})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
