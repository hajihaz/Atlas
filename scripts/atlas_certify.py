#!/usr/bin/env python3
from pathlib import Path

from atlas.certification import certify_offline

root = Path(__file__).resolve().parents[1]
report = certify_offline(root)
for check in report.checks:
    print(f"[{'PASS' if check.passed else 'FAIL'}] {check.name}: {check.detail}")
print(f"ATLAS OFFLINE CERTIFICATION: {report.status}")
raise SystemExit(0 if report.passed else 1)
