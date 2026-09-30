"""Evidence container for external compliance review; Atlas cannot self-approve it."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ComplianceEvidence:
    jurisdiction: str
    account_scope: str
    instrument_scope: str
    reviewer: str
    reference: str
    approved: bool = False

    def validate(self) -> None:
        if not all(
            (
                self.jurisdiction,
                self.account_scope,
                self.instrument_scope,
                self.reviewer,
                self.reference,
            )
        ):
            raise ValueError("complete external compliance evidence is required")
        if not self.approved:
            raise RuntimeError("compliance review has not approved live operation")
