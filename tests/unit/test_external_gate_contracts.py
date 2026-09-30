import pytest

from atlas.governance.compliance import ComplianceEvidence
from atlas.security.secrets import require_runtime_secret


class FakeSecrets:
    def __init__(self, value: str):
        self.value = value

    def get_secret(self, name: str) -> str:
        return self.value


def test_secret_boundary_returns_runtime_value_without_persisting_it() -> None:
    assert (
        require_runtime_secret(FakeSecrets("runtime-only"), "upstox/live/token") == "runtime-only"
    )
    with pytest.raises(ValueError):
        require_runtime_secret(FakeSecrets("x"), "token=embedded")
    with pytest.raises(RuntimeError):
        require_runtime_secret(FakeSecrets(""), "upstox/live/token")


def test_compliance_evidence_cannot_self_approve() -> None:
    evidence = ComplianceEvidence("IN", "individual", "NSE cash", "external-reviewer", "ref-1")
    with pytest.raises(RuntimeError, match="has not approved"):
        evidence.validate()
