"""Authenticated evidence receipt for externally recorded paper sessions.

The issuer must be a separately trusted data capture process. A locally created
receipt is not, by itself, proof that market-session data actually came from a broker.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import hmac
from dataclasses import asdict, dataclass, replace

from atlas.common.hashing import canonical_json


@dataclass(frozen=True)
class RecordedPaperAttestation:
    provider: str
    first_session: dt.datetime
    last_session: dt.datetime
    session_count: int
    research_result_hash: str
    ledger_hash: str
    market_sessions_hash: str
    signature: str = ""

    def payload(self) -> dict[str, object]:
        data = asdict(self)
        data.pop("signature")
        return data


def sign_recorded_paper_receipt(
    receipt: RecordedPaperAttestation, *, signing_key: bytes
) -> RecordedPaperAttestation:
    if not signing_key:
        raise ValueError("signing key is required")
    if not valid_receipt_metadata(receipt):
        raise ValueError("incomplete external paper receipt")
    digest = hmac.new(
        signing_key, canonical_json(receipt.payload()).encode(), hashlib.sha256
    ).hexdigest()
    return replace(receipt, signature=digest)


def valid_receipt_metadata(receipt: RecordedPaperAttestation) -> bool:
    return (
        bool(receipt.provider.strip())
        and receipt.session_count > 0
        and bool(receipt.research_result_hash)
        and bool(receipt.ledger_hash)
        and bool(receipt.market_sessions_hash)
        and receipt.first_session.tzinfo is not None
        and receipt.first_session.utcoffset() is not None
        and receipt.last_session.tzinfo is not None
        and receipt.last_session.utcoffset() is not None
        and receipt.last_session >= receipt.first_session
    )


def verify_recorded_paper_receipt(
    receipt: RecordedPaperAttestation | None, *, verifier_key: bytes | None
) -> bool:
    if receipt is None or not verifier_key or not valid_receipt_metadata(receipt):
        return False
    expected = hmac.new(
        verifier_key, canonical_json(receipt.payload()).encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, receipt.signature)
