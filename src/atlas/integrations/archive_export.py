"""Offline Parquet export with integrity-only provenance manifest.

This does NOT authenticate an NSE provider, exchange timing or data rights.
File publication is no-clobber. A crash may leave just one artifact; consumers
must verify the pair before using it, never trust a standalone Parquet file.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import uuid
from dataclasses import asdict
from pathlib import Path
from typing import Any

from atlas.integrations.history_store import CandleArchive


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while block := stream.read(1024 * 1024):
            digest.update(block)
    return digest.hexdigest()


def manifest_path(parquet: Path) -> Path:
    file = Path(parquet)
    if file.suffix != ".parquet":
        raise ValueError("export requires .parquet suffix")
    return file.with_suffix(".manifest.json")


def verify_parquet_export(parquet: Path) -> dict[str, object]:
    """Check copied file's local hash, not provider data authenticity."""
    path = Path(parquet)
    if not path.is_file():
        raise ValueError("Parquet export file unavailable")
    sidecar = manifest_path(path)
    if not sidecar.is_file():
        raise ValueError("matching Parquet provenance manifest unavailable")
    try:
        contents = json.loads(sidecar.read_text(encoding="utf-8"))
    except (ValueError, UnicodeError):
        raise ValueError("invalid export manifest") from None
    if not isinstance(contents, dict) or (
        contents.get("schema_version") != 1
        or contents.get("parquet_filename") != path.name
        or contents.get("source_rights_verified") is not False
        or contents.get("point_in_time_universe_verified") is not False
        or contents.get("status") != "LOCAL_FILE_INTEGRITY_ONLY_NOT_NSE_CERTIFIED"
        or not isinstance(contents.get("sources"), list)
        or not contents["sources"]
        or any(
            not isinstance(source, dict)
            or source.get("source_rights_verified") is not False
            or source.get("point_in_time_universe_verified") is not False
            or any(
                not isinstance(receipt, dict)
                or receipt.get("rights_status") != "UNVERIFIED"
                or receipt.get("provider_authentication_verified") is not False
                or receipt.get("point_in_time_universe_verified") is not False
                for receipt in source.get("receipts", [])
            )
            for source in contents["sources"]
        )
        or not isinstance(contents.get("parquet_bytes"), int)
        or contents["parquet_bytes"] <= 0
    ):
        raise ValueError("unsupported or unsafe Parquet provenance manifest")
    if path.stat().st_size != contents["parquet_bytes"]:
        raise RuntimeError("Parquet file length does not match manifest")
    if _sha256_file(path) != contents.get("parquet_sha256"):
        raise RuntimeError("Parquet file checksum does not match manifest")
    return {
        "status": "LOCAL_FILE_INTEGRITY_PASSED_NOT_NSE_CERTIFIED",
        "parquet_filename": path.name,
        "parquet_bytes": contents["parquet_bytes"],
        "parquet_sha256": contents["parquet_sha256"],
        "source_count": len(contents["sources"]),
        "source_rights_verified": False,
        "point_in_time_universe_verified": False,
        "live_money_enabled": False,
    }


def export_parquet_with_manifest(archive: CandleArchive, destination: Path) -> dict[str, object]:
    dest = Path(destination).absolute()
    sidecar = manifest_path(dest)
    # Reject existing files including dangling symlinks; never overwrite output.
    if os.path.lexists(dest) or os.path.lexists(sidecar):
        raise ValueError("Parquet or manifest output already exists")
    if not archive.path.is_file():
        raise ValueError("historical archive does not exist")
    db = archive._connect()
    try:
        observed = int(db.execute("SELECT count(*) FROM candles").fetchone()[0])
        sources = db.execute(
            "SELECT DISTINCT provider,instrument,interval FROM candles "
            "ORDER BY provider,instrument,interval"
        ).fetchall()
    finally:
        db.close()
    if observed == 0:
        raise ValueError("no historical candles to export")
    provenances = [
        asdict(archive.provenance(str(provider), str(instrument), str(interval)))
        for provider, instrument, interval in sources
    ]
    marker = uuid.uuid4().hex
    temp = dest.with_name(f".{dest.stem}.{marker}.parquet")
    temp_manifest = sidecar.with_name(f".{sidecar.name}.{marker}.tmp")
    linked_parquet = False
    linked_manifest = False
    try:
        archive.export_parquet(temp)
        # Separate reads around a copy are not a single immutable snapshot.
        # Refuse publication if any archive addition or receipt appeared while
        # copying. The owner must pause concurrent ingestion for a strict export.
        db = archive._connect()
        try:
            file_rows = int(
                db.execute("SELECT count(*) FROM read_parquet(?)", (str(temp),)).fetchone()[0]
            )
            current_rows = int(db.execute("SELECT count(*) FROM candles").fetchone()[0])
            current_sources = db.execute(
                "SELECT DISTINCT provider,instrument,interval FROM candles "
                "ORDER BY provider,instrument,interval"
            ).fetchall()
        finally:
            db.close()
        if file_rows != observed or current_rows != observed or current_sources != sources:
            raise RuntimeError("history changed while exporting; retry with ingestion paused")
        current_provenances = [
            asdict(archive.provenance(str(provider), str(instrument), str(interval)))
            for provider, instrument, interval in current_sources
        ]
        if current_provenances != provenances:
            raise RuntimeError("provenance changed while exporting; retry with ingestion paused")
        document: dict[str, Any] = {
            "schema_version": 1,
            "status": "LOCAL_FILE_INTEGRITY_ONLY_NOT_NSE_CERTIFIED",
            "parquet_filename": dest.name,
            "parquet_sha256": _sha256_file(temp),
            "parquet_bytes": temp.stat().st_size,
            "archive_observed_candles": observed,
            "source_rights_verified": False,
            "point_in_time_universe_verified": False,
            "created_at_local_utc": dt.datetime.now(dt.UTC).isoformat(),
            "sources": provenances,
            "warning": (
                "Locally consistent export only. Neither receipt hash nor file "
                "checksum verifies provider authenticity, timing, rights or NSE coverage."
            ),
        }
        with temp_manifest.open("x", encoding="utf-8") as handle:
            json.dump(document, handle, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        # Hard links atomically fail if output exists, so concurrent exporters
        # cannot silently clobber each other. Pair verification detects crash or
        # interruption between publication steps.
        os.link(temp, dest)
        linked_parquet = True
        os.link(temp_manifest, sidecar)
        linked_manifest = True
        result = verify_parquet_export(dest)
        return {
            **result,
            "path": str(dest),
            "manifest_path": str(sidecar),
            "manifest_filename": sidecar.name,
        }
    except Exception:
        if linked_manifest:
            sidecar.unlink(missing_ok=True)
        if linked_parquet:
            dest.unlink(missing_ok=True)
        raise
    finally:
        temp.unlink(missing_ok=True)
        temp_manifest.unlink(missing_ok=True)
