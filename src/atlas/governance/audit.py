"""Static readiness audit for the Atlas capital boundary.

The audit is intentionally conservative: it reports suspicious authority patterns but does
not declare live readiness. Human/security review remains an independent prerequisite.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class AuditFinding:
    path: str
    line: int
    code: str
    message: str


NETWORK_PATTERNS = (
    "requests.post",
    "requests.put",
    "requests.patch",
    "httpx.post",
    "httpx.put",
    "httpx.patch",
    "urlopen(",
)
ORDER_PATTERNS = ("create_order(", "submit_order(", "place_order(")
SECRET_PATTERNS = ("UPSTOX_ACCESS_TOKEN=", "UPSTOX_SECRET=", "CLIENT_SECRET=")


def scan_tree(root: Path) -> tuple[AuditFinding, ...]:
    findings = []
    for path in sorted(root.rglob("*.py")):
        if "__pycache__" in path.parts or path.name == "audit.py":
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for n, line in enumerate(text.splitlines(), 1):
            for pattern in NETWORK_PATTERNS:
                if pattern in line and path.name != "upstox_transport.py":
                    findings.append(AuditFinding(str(path), n, "NETWORK_AUTHORITY", pattern))
            for pattern in ORDER_PATTERNS:
                if pattern in line and path.name != "upstox_transport.py":
                    findings.append(AuditFinding(str(path), n, "ORDER_AUTHORITY", pattern))
            for pattern in SECRET_PATTERNS:
                if pattern in line:
                    findings.append(AuditFinding(str(path), n, "SECRET_LITERAL", pattern))
    return tuple(findings)
