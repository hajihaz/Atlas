"""DuckDB local immutable candle archive, with opt-in Parquet export."""

from __future__ import annotations

from pathlib import Path
from typing import Any, cast

from atlas.integrations.nse_sources import HistoricalBatch


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
        return db

    def add(self, batch: HistoricalBatch) -> int:
        if batch.status != "UNCERTIFIED_INSTRUMENT_HISTORY":
            raise ValueError("unrecognized source attestation")
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
