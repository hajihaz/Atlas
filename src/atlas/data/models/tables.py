"""The Atlas market-data schema (PostgreSQL).

Design highlights (ADR 0011 / data-architecture.md):

* **Bitemporal, append-only** fact tables (``ohlcv_observations``, ``corporate_actions``,
  ``index_membership``): every version carries ``knowledge_from``/``knowledge_to``; the
  "current" version has ``knowledge_to = FAR_FUTURE``. Corrections INSERT a new row and
  close the old one — nothing is ever UPDATEd in place.
* **Instruments are never deleted** — delisted names persist, which is what makes the
  universe survivorship-bias-free.
* **Raw, unadjusted prices** are the source of truth; adjusted prices are derived on read.
* **Append-only, hash-chained trial ledger** for tamper-evidence (ADR 0009 / 0012).

Integrity hardening applied in **migration 0002** (PostgreSQL-specific): BEFORE UPDATE/DELETE
triggers making the append-only tables truly immutable, ``REVOKE UPDATE/DELETE`` from the
writer role, a least-privilege ``atlas_reader`` (SELECT-only) role, partial-unique
"one current version" indexes on all three bitemporal tables, and ``btree_gist`` EXCLUDE
constraints preventing overlapping knowledge intervals. **Declarative range partitioning of
``ohlcv_observations`` by ``event_date`` is a planned follow-up migration** (it must be
declared at table creation, so it will recreate-and-copy) — it is NOT yet in place; do not
assume it. See docs/data/data-architecture.md.
"""

from __future__ import annotations

import datetime as _dt
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from atlas.common.time_utils import FAR_FUTURE
from atlas.data.models.base import Base

_PRICE = Numeric(20, 6)
_TS = DateTime(timezone=True)  # tz-aware everywhere — naive timestamps are forbidden


class SourceRow(Base):
    __tablename__ = "sources"
    name: Mapped[str] = mapped_column(String(64), primary_key=True)
    tier: Mapped[str] = mapped_column(String(16), default="unverified")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[_dt.datetime] = mapped_column(_TS)


class InstrumentRow(Base):
    __tablename__ = "instruments"
    instrument_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    isin: Mapped[str | None] = mapped_column(String(12), index=True, nullable=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True)  # current symbol; history below
    name: Mapped[str] = mapped_column(String(256))
    instrument_type: Mapped[str] = mapped_column(String(24))
    listing_date: Mapped[_dt.date | None] = mapped_column(Date, nullable=True)
    delisting_date: Mapped[_dt.date | None] = mapped_column(Date, nullable=True)  # never deleted
    meta: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class OHLCVObservation(Base):
    """Bitemporal, append-only, raw (unadjusted) daily bar."""

    __tablename__ = "ohlcv_observations"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    instrument_id: Mapped[str] = mapped_column(ForeignKey("instruments.instrument_id"), index=True)
    event_date: Mapped[_dt.date] = mapped_column(Date, index=True)  # valid time (session)
    open: Mapped[Decimal] = mapped_column(_PRICE)
    high: Mapped[Decimal] = mapped_column(_PRICE)
    low: Mapped[Decimal] = mapped_column(_PRICE)
    close: Mapped[Decimal] = mapped_column(_PRICE)
    volume: Mapped[int] = mapped_column(BigInteger)
    source: Mapped[str] = mapped_column(String(64))
    knowledge_from: Mapped[_dt.datetime] = mapped_column(_TS)  # transaction time
    knowledge_to: Mapped[_dt.datetime] = mapped_column(_TS, default=FAR_FUTURE)
    revision: Mapped[int] = mapped_column(Integer, default=0)
    run_id: Mapped[str | None] = mapped_column(String(32), index=True, nullable=True)

    __table_args__ = (
        # Version identity. ``revision`` is included so a correction stamped at the *same*
        # knowledge instant as the original (e.g. two payloads in one run) is a distinct
        # version, not a constraint collision (append_revision still requires monotonic time).
        UniqueConstraint(
            "instrument_id",
            "event_date",
            "source",
            "knowledge_from",
            "revision",
            name="ohlcv_version",
        ),
        # Fast as-of lookups.
        Index("ix_ohlcv_asof", "instrument_id", "event_date", "knowledge_from", "knowledge_to"),
        # The "exactly one current version" partial-unique index and the non-overlap EXCLUDE
        # constraint are added in migration 0002 (they need PostgreSQL-specific DDL).
    )


class CorporateActionRow(Base):
    __tablename__ = "corporate_actions"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    instrument_id: Mapped[str] = mapped_column(ForeignKey("instruments.instrument_id"), index=True)
    ca_type: Mapped[str] = mapped_column(String(24))
    ex_date: Mapped[_dt.date] = mapped_column(Date, index=True)
    terms: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)  # ratios/amounts as strings
    source: Mapped[str] = mapped_column(String(64))
    knowledge_from: Mapped[_dt.datetime] = mapped_column(_TS)
    knowledge_to: Mapped[_dt.datetime] = mapped_column(_TS, default=FAR_FUTURE)
    revision: Mapped[int] = mapped_column(Integer, default=0)


class IndexMembershipRow(Base):
    """Bitemporal index membership — survivorship-bias-free by construction."""

    __tablename__ = "index_membership"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    index_code: Mapped[str] = mapped_column(String(32), index=True)
    instrument_id: Mapped[str] = mapped_column(ForeignKey("instruments.instrument_id"), index=True)
    valid_from: Mapped[_dt.date] = mapped_column(Date)  # in the index from
    valid_to: Mapped[_dt.date] = mapped_column(Date)  # ... to (FAR_FUTURE date if current)
    source: Mapped[str] = mapped_column(String(64))
    knowledge_from: Mapped[_dt.datetime] = mapped_column(_TS)
    knowledge_to: Mapped[_dt.datetime] = mapped_column(_TS, default=FAR_FUTURE)
    revision: Mapped[int] = mapped_column(Integer, default=0)
    __table_args__ = (Index("ix_member_asof", "index_code", "knowledge_from", "knowledge_to"),)


class TradingHoliday(Base):
    __tablename__ = "trading_holidays"
    exchange: Mapped[str] = mapped_column(String(16), primary_key=True)
    holiday_date: Mapped[_dt.date] = mapped_column(Date, primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    source: Mapped[str] = mapped_column(String(64))
    knowledge_from: Mapped[_dt.datetime] = mapped_column(_TS)


class IngestionRun(Base):
    __tablename__ = "ingestion_runs"
    run_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    source: Mapped[str] = mapped_column(String(64), index=True)
    requested_scope: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    knowledge_time: Mapped[_dt.datetime] = mapped_column(_TS)
    code_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    dependency_lock_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="completed")
    halted: Mapped[bool] = mapped_column(Boolean, default=False)
    quality_report_digest: Mapped[str | None] = mapped_column(String(64), nullable=True)
    started_at: Mapped[_dt.datetime] = mapped_column(_TS)
    finished_at: Mapped[_dt.datetime | None] = mapped_column(_TS, nullable=True)


class DataQualityFinding(Base):
    __tablename__ = "data_quality_findings"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("ingestion_runs.run_id"), index=True)
    check: Mapped[str] = mapped_column(String(64))
    severity: Mapped[int] = mapped_column(Integer)
    message: Mapped[str] = mapped_column(Text)
    entity_key: Mapped[str | None] = mapped_column(String(128), nullable=True)
    context: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[_dt.datetime] = mapped_column(_TS)


class SnapshotRow(Base):
    __tablename__ = "snapshots"
    snapshot_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    as_of: Mapped[_dt.datetime] = mapped_column(_TS)
    universe_spec: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    content_digest: Mapped[str] = mapped_column(String(64), index=True)
    row_count: Mapped[int] = mapped_column(Integer)
    sources: Mapped[list[str]] = mapped_column(JSON, default=list)
    code_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    dependency_lock_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    storage_uri: Mapped[str | None] = mapped_column(Text, nullable=True)  # Parquet location
    created_at: Mapped[_dt.datetime] = mapped_column(_TS)


class TrialLedgerRow(Base):
    """Append-only, hash-chained trial ledger (never UPDATE/DELETE)."""

    __tablename__ = "trial_ledger"
    seq: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    trial_id: Mapped[str] = mapped_column(String(48), index=True)
    family_id: Mapped[str] = mapped_column(String(48), index=True)
    status: Mapped[str] = mapped_column(String(16))
    recorded_at: Mapped[_dt.datetime] = mapped_column(_TS)
    spec: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    data_snapshot_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    seed: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    code_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    metrics: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    verdict: Mapped[str | None] = mapped_column(Text, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    record_hash: Mapped[str] = mapped_column(String(64))
    prev_hash: Mapped[str] = mapped_column(String(64))
    chain_hash: Mapped[str] = mapped_column(String(64))
