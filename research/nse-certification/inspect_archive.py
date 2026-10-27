#!/usr/bin/env python3
"""Inspect an already-authorized local OLO-format ZIP. No extraction, inference or trading."""

import argparse
import csv
import datetime as dt
import hashlib
import io
import json
import pathlib
import re
import stat
import zipfile
from decimal import Decimal, InvalidOperation

HEADER = ["Ticker", "Date", "Time", "Open", "High", "Low", "Close", "Volume", "Open Interest"]
MAX_EXPANDED = 512 * 1024 * 1024


def file_hash(path):
    digest = hashlib.sha256()
    with pathlib.Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def inspect(path):
    result = {
        "schema": "atlas.nse-local-archive-inspection.v1",
        "archiveSha256": file_hash(path),
        "certified": False,
        "timezone": "UNVERIFIED",
        "timestampConvention": "UNVERIFIED",
        "rights": "NOT_ESTABLISHED_BY_FILE_POSSESSION",
        "members": [],
        "observationsModified": False,
    }
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        if not 1 <= len(entries) <= 100 or len({x.filename for x in entries}) != len(entries):
            raise ValueError("EMPTY_OVERSIZED_OR_DUPLICATE_ARCHIVE")
        total = 0
        for entry in entries:
            name = pathlib.PurePosixPath(entry.filename)
            total += entry.file_size
            if (
                name.is_absolute()
                or ".." in name.parts
                or "\\" in entry.filename
                or stat.S_ISLNK(entry.external_attr >> 16)
                or entry.is_dir()
                or entry.flag_bits & 1
                or not entry.filename.lower().endswith(".csv")
                or total > MAX_EXPANDED
                or entry.file_size > max(1, entry.compress_size) * 200
            ):
                raise ValueError("UNSAFE_ARCHIVE_MEMBER_OR_EXPANSION_LIMIT")
        for entry in entries:
            digest = hashlib.sha256()
            with archive.open(entry) as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(chunk)
            dates = set()
            symbols = set()
            second_counts = {}
            count = zeros = 0
            with (
                archive.open(entry) as stream,
                io.TextIOWrapper(stream, encoding="utf-8-sig", newline="") as text,
            ):
                reader = csv.DictReader(text)
                if reader.fieldnames != HEADER:
                    raise ValueError("UNKNOWN_ARCHIVE_SCHEMA")
                for row in reader:
                    if None in row or any(v is None for v in row.values()):
                        raise ValueError("INVALID_ARCHIVE_CSV_SHAPE")
                    if not re.fullmatch(r"\d{2}/\d{2}/\d{4}", row["Date"]) or not re.fullmatch(
                        r"\d{2}:\d{2}:\d{2}", row["Time"]
                    ):
                        raise ValueError("INVALID_SOURCE_DATE_OR_TIME")
                    day, month, year = map(int, row["Date"].split("/"))
                    date = dt.date(year, month, day)
                    clock = dt.time.fromisoformat(row["Time"])
                    dates.add(date.isoformat())
                    symbols.add(row["Ticker"])
                    if not row["Ticker"]:
                        raise ValueError("MISSING_TICKER")
                    second_counts[str(clock.second)] = second_counts.get(str(clock.second), 0) + 1
                    try:
                        op, hi, lo, cl = [Decimal(row[k]) for k in ["Open", "High", "Low", "Close"]]
                        vol = Decimal(row["Volume"])
                    except InvalidOperation as exc:
                        raise ValueError("NON_NUMERIC_MARKET_ROW") from exc
                    if (
                        not all(v.is_finite() and v > 0 for v in [op, hi, lo, cl])
                        or lo > min(op, cl)
                        or hi < max(op, cl)
                        or lo > hi
                        or not vol.is_finite()
                        or vol < 0
                        or vol != vol.to_integral_value()
                    ):
                        raise ValueError("INVALID_MARKET_ROW")
                    count += 1
                    zeros += vol == 0
            result["members"].append(
                {
                    "filename": entry.filename,
                    "uncompressedSha256": digest.hexdigest(),
                    "uncompressedBytes": entry.file_size,
                    "rows": count,
                    "instrumentCount": len(symbols),
                    "dates": sorted(dates),
                    "timestampSecondHistogram": second_counts,
                    "observedZeroVolumeRows": zeros,
                }
            )
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    result = inspect(args.archive)
    with pathlib.Path(args.output).open("x") as stream:
        json.dump(result, stream, indent=2)
        stream.write("\n")


if __name__ == "__main__":
    main()
