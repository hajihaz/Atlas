"""DuckDB local immutable candle archive, with opt-in Parquet export."""

from __future__ import annotations

import datetime as dt
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast

from atlas.integrations.nse_sources import HistoricalBatch


@dataclass(frozen=True)
class ArchiveReceipt:
    provider: str
    instrument: str
    interval: str
    from_date: str
    to_date: str
    payload_sha256: str
    candle_count: int
    first_ingested_at_utc: str
    receipt_digest: str
    rights_status: str = "UNVERIFIED"
    provider_authentication_verified: bool = False
    point_in_time_universe_verified: bool = False


@dataclass(frozen=True)
class ArchiveProvenance:
    status: str
    observed_candles: int
    receipt_count: int
    legacy_unattributed_candles: int
    receipts: tuple[ArchiveReceipt, ...]
    source_rights_verified: bool = False
    point_in_time_universe_verified: bool = False


def _receipt_payload(
    provider: str,
    instrument: str,
    interval: str,
    start: str,
    end: str,
    digest: str,
    count: int,
    ingested_at: str,
) -> dict[str, str | int]:
    return {
        "provider": provider,
        "instrument": instrument,
        "interval": interval,
        "from_date": start,
        "to_date": end,
        "payload_sha256": digest,
        "candle_count": count,
        "first_ingested_at_utc": ingested_at,
    }


def _receipt_hash(payload: dict[str, str | int]) -> str:
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


class CandleArchive:
    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        if self.path.suffix != ".duckdb":
            raise ValueError("local archive must end in .duckdb")

    def _connect(self) -> Any:
        try:
            import duckdb
        except ImportError:
            raise RuntimeError("DuckDB optional dependency not installed") from None
        self.path.parent.mkdir(parents=True, exist_ok=True)
        db = duckdb.connect(str(self.path))
        db.execute("""
        CREATE TABLE IF NOT EXISTS candles (
          provider VARCHAR NOT NULL, instrument VARCHAR NOT NULL,
          interval VARCHAR NOT NULL, timestamp_utc TIMESTAMPTZ NOT NULL,
          open DECIMAL(28,8) NOT NULL, high DECIMAL(28,8) NOT NULL,
          low DECIMAL(28,8) NOT NULL, close DECIMAL(28,8) NOT NULL,
          volume BIGINT NOT NULL, payload_sha256 VARCHAR NOT NULL,
          evidence_status VARCHAR NOT NULL,
          PRIMARY KEY(provider,instrument,interval,timestamp_utc)
        )
        """)
        db.execute("""
        CREATE TABLE IF NOT EXISTS history_receipts (
          provider VARCHAR NOT NULL, instrument VARCHAR NOT NULL,
          interval VARCHAR NOT NULL, from_date DATE NOT NULL, to_date DATE NOT NULL,
          payload_sha256 VARCHAR NOT NULL, candle_count INTEGER NOT NULL,
          first_ingested_at_utc VARCHAR NOT NULL,
          receipt_digest VARCHAR NOT NULL,
          PRIMARY KEY (provider,instrument,interval,from_date,to_date,payload_sha256)
        )
        """)
        return db

    def add(
        self,
        batch: HistoricalBatch,
        *,
        received_at: dt.datetime | None = None,
    ) -> int:
        if batch.status != "UNCERTIFIED_INSTRUMENT_HISTORY":
            raise ValueError("unrecognized source attestation")
        observed_at = received_at if received_at is not None else dt.datetime.now(dt.UTC)
        if observed_at.tzinfo is None or observed_at.utcoffset() is None:
            raise ValueError("receipt timestamp must include timezone")
        observed_at = observed_at.astimezone(dt.UTC)
        if len(batch.payload_sha256) != 64 or any(
            ch not in "0123456789abcdef" for ch in batch.payload_sha256
        ):
            raise ValueError("unrecognized payload SHA-256")
        payload = _receipt_payload(
            batch.provider,
            batch.instrument,
            batch.interval,
            batch.from_date.isoformat(),
            batch.to_date.isoformat(),
            batch.payload_sha256,
            len(batch.candles),
            observed_at.isoformat(),
        )
        db = self._connect()
        try:
            db.execute("BEGIN TRANSACTION")
            count = 0
            for bar in batch.candles:
                key = (batch.provider, batch.instrument, batch.interval, bar.timestamp)
                existing = db.execute(
                    """
                    SELECT open,high,low,close,volume,payload_sha256 FROM candles
                    WHERE provider=? AND instrument=? AND interval=? AND timestamp_utc=?
                """,
                    key,
                ).fetchone()
                if existing is not None:
                    # A different vendor payload hash may indicate a correction. Never
                    # silently mutate old evidence; a new version needs an explicit run.
                    if (
                        tuple(str(x) for x in existing[:4])
                        != tuple(f"{x:.8f}" for x in (bar.open, bar.high, bar.low, bar.close))
                        or existing[4] != bar.volume
                        or existing[5] != batch.payload_sha256
                    ):
                        raise ValueError("conflicting historical bar; immutable archive")
                    continue
                db.execute(
                    """
                  INSERT INTO candles VALUES (?,?,?,?,?,?,?,?,?,?,?)
                """,
                    (
                        *key,
                        bar.open,
                        bar.high,
                        bar.low,
                        bar.close,
                        bar.volume,
                        batch.payload_sha256,
                        batch.status,
                    ),
                )
                count += 1
            # The receipt is written in the SAME transaction as its candles.
            # Repeated batches retain the original receipt timestamp.
            prior = db.execute(
                """SELECT receipt_digest, first_ingested_at_utc, candle_count
                FROM history_receipts
                WHERE provider=? AND instrument=? AND interval=?
                  AND from_date=? AND to_date=? AND payload_sha256=?""",
                (
                    batch.provider,
                    batch.instrument,
                    batch.interval,
                    batch.from_date,
                    batch.to_date,
                    batch.payload_sha256,
                ),
            ).fetchone()
            if prior is None:
                db.execute(
                    """INSERT INTO history_receipts VALUES (?,?,?,?,?,?,?,?,?)""",
                    (
                        batch.provider,
                        batch.instrument,
                        batch.interval,
                        batch.from_date,
                        batch.to_date,
                        batch.payload_sha256,
                        len(batch.candles),
                        observed_at.isoformat(),
                        _receipt_hash(payload),
                    ),
                )
            else:
                original = _receipt_payload(
                    batch.provider,
                    batch.instrument,
                    batch.interval,
                    batch.from_date.isoformat(),
                    batch.to_date.isoformat(),
                    batch.payload_sha256,
                    int(prior[2]),
                    str(prior[1]),
                )
                if str(prior[0]) != _receipt_hash(original) or int(prior[2]) != len(batch.candles):
                    raise ValueError("conflicting or tampered archive receipt")
            db.execute("COMMIT")
            return count
        except Exception:
            db.execute("ROLLBACK")
            raise
        finally:
            db.close()

    def rows(self, provider: str, instrument: str, interval: str) -> list[tuple[object, ...]]:
        db = self._connect()
        try:
            return cast(
                list[tuple[object, ...]],
                db.execute(
                    """
                SELECT timestamp_utc,open,high,low,close,volume,payload_sha256
                FROM candles WHERE provider=? AND instrument=? AND interval=?
                ORDER BY timestamp_utc
            """,
                    (provider, instrument, interval),
                ).fetchall(),
            )
        finally:
            db.close()

    def provenance(self, provider: str, instrument: str, interval: str) -> ArchiveProvenance:
        if not self.path.is_file():
            raise ValueError("archive does not exist")
        db = self._connect()
        try:
            rows = db.execute(
                """SELECT provider,instrument,interval,CAST(from_date AS VARCHAR),
                CAST(to_date AS VARCHAR),payload_sha256,candle_count,
                first_ingested_at_utc,receipt_digest
                FROM history_receipts WHERE provider=? AND instrument=? AND interval=?
                ORDER BY from_date,to_date,payload_sha256""",
                (provider, instrument, interval),
            ).fetchall()
            receipt_records = []
            for raw in rows:
                source = _receipt_payload(
                    str(raw[0]),
                    str(raw[1]),
                    str(raw[2]),
                    str(raw[3]),
                    str(raw[4]),
                    str(raw[5]),
                    int(raw[6]),
                    str(raw[7]),
                )
                if str(raw[8]) != _receipt_hash(source):
                    raise RuntimeError("archive receipt checksum mismatch")
                receipt_records.append(
                    ArchiveReceipt(
                        provider=str(raw[0]),
                        instrument=str(raw[1]),
                        interval=str(raw[2]),
                        from_date=str(raw[3]),
                        to_date=str(raw[4]),
                        payload_sha256=str(raw[5]),
                        candle_count=int(raw[6]),
                        first_ingested_at_utc=str(raw[7]),
                        receipt_digest=str(raw[8]),
                    )
                )
            count = int(
                db.execute(
                    "SELECT count(*) FROM candles WHERE provider=? AND instrument=? AND interval=?",
                    (provider, instrument, interval),
                ).fetchone()[0]
            )
            missing = int(
                db.execute(
                    """SELECT count(*) FROM candles c
                WHERE c.provider=? AND c.instrument=? AND c.interval=?
                AND NOT EXISTS (
                    SELECT 1 FROM history_receipts r
                    WHERE r.provider=c.provider AND r.instrument=c.instrument
                      AND r.interval=c.interval
                      AND r.payload_sha256=c.payload_sha256
                )""",
                    (provider, instrument, interval),
                ).fetchone()[0]
            )
            return ArchiveProvenance(
                "UNVERIFIED_SOURCE_RIGHTS_AND_EXCHANGE_TIMING",
                count,
                len(receipt_records),
                missing,
                tuple(receipt_records),
            )
        finally:
            db.close()

    def export_parquet(self, path: Path) -> Path:
        dest = Path(path).resolve()
        if dest.suffix != ".parquet" or dest.exists():
            raise ValueError("Parquet output must be new and end with .parquet")
        dest.parent.mkdir(parents=True, exist_ok=True)
        db = self._connect()
        try:
            # Destination is a validated local path, quoted as a SQL literal.
            literal = str(dest).replace("'", "''")
            db.execute(
                "COPY (SELECT * FROM candles ORDER BY provider,instrument,interval,timestamp_utc) "  # noqa: S608
                f"TO '{literal}' (FORMAT PARQUET, COMPRESSION ZSTD)"
            )
            return dest
        finally:
            db.close()
