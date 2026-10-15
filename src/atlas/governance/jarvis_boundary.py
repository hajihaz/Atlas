"""Read-only Jarvis integration; never grants broker authority."""

from __future__ import annotations

from dataclasses import dataclass

from atlas.deployment_policy import validate_deployment_policy
from atlas.governance.live_gate import LiveReadiness


@dataclass(frozen=True)
class JarvisAtlasStatus:
    live_capital_blocked: bool
    readiness_blockers: tuple[str, ...]
    deployment_policy_passed: bool
    deployment_policy_hash: str


class JarvisReadOnlyBoundary:
    """Safe status projection, omitting credentials and mutable order control."""

    def __init__(self, readiness: LiveReadiness) -> None:
        self._readiness = readiness

    def snapshot(self) -> JarvisAtlasStatus:
        policy = validate_deployment_policy()
        return JarvisAtlasStatus(
            live_capital_blocked=not self._readiness.all_passed,
            readiness_blockers=self._readiness.blockers,
            deployment_policy_passed=policy.passed,
            deployment_policy_hash=policy.policy_hash,
        )

    def request_order(self, *_args: object, **_kwargs: object) -> None:
        raise PermissionError("Jarvis is advisory/read-only and cannot cross broker boundary")

    def enable_live_mode(self) -> None:
        raise PermissionError("Jarvis cannot authorize or enable live capital")
