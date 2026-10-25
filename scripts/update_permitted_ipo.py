#!/usr/bin/env python3
"""Permitted publisher IPO calendar. No exchange scraping, bids or inferred cutoffs.

Xflot: https://www.xflot.com/api-docs (attribution, disclaimer, <=1 request/minute).
GMP Today: https://gmptoday.in/api/ (CC-BY-4.0; three-issue sample only).
Calendar observation, publisher modification, demand and GMP clocks stay separate.
"""

from __future__ import annotations

import argparse
import fcntl
import json
import math
import os
import re
import tempfile
import urllib.request
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from update_ipo_feed import company_key, match_issue, parse_gmptoday, parse_xflot

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / ".atlas-runtime"
XFLOT = "https://www.xflot.com/api/public/market/ipos?limit=200"
GMP_TODAY = "https://gmptoday.in/api/gmp.json"
MAX_BYTES = 1_000_000


def stamp(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.astimezone(UTC) if parsed.tzinfo else None
    except ValueError:
        return None


def calendar_date(value):
    if not isinstance(value, str) or not re.fullmatch(r"20\d{2}-\d{2}-\d{2}(?:T[0-9:.]+Z)?", value):
        return None
    try:
        return date.fromisoformat(value[:10]).isoformat()
    except ValueError:
        return None


def number(value, *, integer=False, maximum=1_000_000_000):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if not math.isfinite(value) or value < 0 or value > maximum:
        return None
    if integer and (value <= 0 or int(value) != value):
        return None
    return int(value) if integer else value


def atomic(path, value):
    path = Path(path)
    if path.is_symlink() or path.parent.is_symlink():
        raise ValueError("Unsafe snapshot path")
    raw = json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    if len(raw.encode()) > MAX_BYTES:
        raise ValueError("Snapshot exceeds bound")
    fd, temp = tempfile.mkstemp(prefix=path.name + ".", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as handle:
            handle.write(raw + "\n")
        os.replace(temp, path)
    finally:
        Path(temp).unlink(missing_ok=True)


def ambiguous_instrument_or_units(row):
    """Conservative quarantine, not an assertion of an issuer's legal eligibility.

    The publisher mixes some social/debt and sub-rupee/unit-ambiguous records into
    its IPO list. Such rows need independently verified equity terms before use.
    """
    name = str(row.get("name") or "")
    symbol = str(row.get("symbol") or "")
    if re.search(r"\b(?:ZCZP|NCD|debentures?|bonds?)\b", name, re.IGNORECASE):
        return True
    if row.get("lotSize") is None and re.fullmatch(r"[A-Z]{2,}[GN]\d{2}", symbol):
        return True
    prices = [row.get("priceMin"), row.get("priceMax")]
    return any(
        isinstance(value, (int, float)) and not isinstance(value, bool) and 0 <= value < 1
        for value in prices
    )


def build_snapshot(data, *, observed_at, gmp_data=None, previous=None, now=None):
    now = now or datetime.now(UTC)
    observed = stamp(observed_at)
    if not observed or not -60 <= (now - observed).total_seconds() <= 3 * 3600:
        raise ValueError("Calendar observation is stale or future")
    if (
        not isinstance(data, dict)
        or data.get("ok") is not True
        or not isinstance(data.get("ipos"), list)
        or not 1 <= len(data["ipos"]) <= 200
        or data.get("count") != len(data["ipos"])
        or not isinstance(data.get("disclaimer"), str)
        or not 10 <= len(data["disclaimer"]) <= 4000
    ):
        raise ValueError("Xflot response/schema changed")
    old = previous.get("issues", []) if isinstance(previous, dict) else []
    prior = {
        (company_key(i.get("company")), i.get("board"), i.get("openDate"), i.get("closeDate")): i
        for i in old
        if isinstance(i, dict)
    }
    readings = parse_xflot(data, now)
    warnings = []
    if gmp_data is not None:
        try:
            readings.extend(parse_gmptoday(gmp_data, now))
        except (ValueError, TypeError):
            warnings.append(
                "GMP Today sample unavailable; Xflot readings remain independently dated."
            )
    issues = []
    identities = set()
    excluded = {"undated": 0, "conflicted": 0, "outsideWindow": 0, "quarantined": 0, "invalid": 0}
    today = now.astimezone(ZoneInfo("Asia/Kolkata")).date()
    for row in data["ipos"]:
        if not isinstance(row, dict):
            excluded["invalid"] += 1
            continue
        opening, closing = calendar_date(row.get("openDate")), calendar_date(row.get("closeDate"))
        if not opening or not closing:
            excluded["undated"] += 1
            continue
        if closing < opening:
            raise ValueError("Publisher date order is invalid")
        if (
            not today - timedelta(days=35)
            <= date.fromisoformat(closing)
            <= today + timedelta(days=90)
        ):
            excluded["outsideWindow"] += 1
            continue
        lifecycle = row.get("lifecycle")
        if not isinstance(lifecycle, dict) or lifecycle.get("conflicted") is not False:
            excluded["conflicted"] += 1
            continue
        if ambiguous_instrument_or_units(row):
            excluded["quarantined"] += 1
            continue
        board, status = row.get("board"), str(row.get("status", "")).upper()
        name, slug = row.get("name"), row.get("slug")
        if (
            board not in ("MAINBOARD", "SME")
            or status not in ("OPEN", "UPCOMING", "CLOSED", "LISTED")
            or not isinstance(name, str)
            or not 2 <= len(name) <= 200
            or not isinstance(slug, str)
            or not re.fullmatch(r"[a-z0-9-]{2,120}", slug)
        ):
            excluded["invalid"] += 1
            continue
        identity = (company_key(name), board, opening, closing)
        if identity in identities:
            raise ValueError("Duplicate publisher issue identity")
        identities.add(identity)
        previous_issue = prior.get(identity, {})
        symbol = row.get("symbol")
        ident = previous_issue.get("id") or (
            symbol
            if isinstance(symbol, str) and re.fullmatch(r"[A-Z0-9&_-]{1,40}", symbol)
            else "XFLOT-" + slug
        )
        updated = stamp(row.get("updatedAt"))
        updated_fresh = updated and -60 <= (now - updated).total_seconds() <= 180 * 60
        # Keep only independently dated prior headlines; no news request per issue.
        news = [
            n
            for n in previous_issue.get("news", [])
            if isinstance(n, dict)
            and stamp(n.get("publishedAt"))
            and timedelta(0) <= now - stamp(n["publishedAt"]) <= timedelta(days=14)
        ][:5]
        issue = {
            "id": ident,
            "company": previous_issue.get("company") or name,
            "board": board,
            "openDate": opening,
            "closeDate": closing,
            "status": "CLOSED" if status in ("LISTED", "CLOSED") else status,
            "priceMin": number(row.get("priceMin")),
            "priceMax": number(row.get("priceMax")),
            "lotSize": number(row.get("lotSize"), integer=True, maximum=1_000_000),
            "subscription": {
                "qib": None,
                "nii": None,
                "retail": None,
                "individual": None,
                "total": number(row.get("lastSubX")) if updated_fresh else None,
            },
            "subscriptionAsOf": row.get("updatedAt") if updated_fresh else None,
            "gmp": None,
            "gmpAsOf": None,
            "gmpReadings": [],
            "gmpHistory": [],
            "financials": None,
            "news": news,
            "newsStatus": "Dated publisher headlines retained; not independent confirmation"
            if news
            else "No verified issuer-matched headlines",
            "source": XFLOT,
            "detailSource": "https://www.xflot.com/api-docs",
            "sourceKind": "PUBLISHER_AGGREGATE",
            "sourceObservedAt": observed_at,
            "sourceUpdatedAt": row.get("updatedAt") if updated else None,
            "sourceStale": False,
            "providerSlug": slug,
            "providerStatus": status,
            "bidDeadline": None,
            "mandateDeadline": None,
            # Publisher data does not independently verify an issuer/registrar relationship.
            "registrar": None,
        }
        if (
            issue["priceMin"] is not None
            and issue["priceMax"] is not None
            and issue["priceMin"] > issue["priceMax"]
        ):
            raise ValueError("Publisher price band is invalid")
        matches = [r for r in readings if match_issue(issue, r["record"], r["provider"])]
        if matches:
            chosen = next((r for r in matches if r["provider"] == "GMP Today"), matches[0])
            values = [r["gmp"] for r in matches]
            disputed = max(values) - min(values) > max(max(abs(v) for v in values) * 0.5, 10)
            issue.update(
                {
                    "gmp": chosen["gmp"],
                    "gmpAsOf": chosen["asOf"],
                    "gmpProvider": chosen["provider"],
                    "gmpSources": chosen["sources"],
                    "gmpDisputed": disputed or any(r["disputed"] for r in matches),
                    "gmpEstimatedGainPct": round(100 * chosen["gmp"] / issue["priceMax"], 2)
                    if issue["priceMax"]
                    else None,
                    "gmpReadings": [
                        {
                            k: r[k]
                            for k in (
                                "provider",
                                "gmp",
                                "asOf",
                                "url",
                                "sources",
                                "disputed",
                                "range",
                                "attribution",
                            )
                        }
                        for r in matches
                    ],
                }
            )
        issues.append(issue)
    if not issues or len({i["id"] for i in issues}) != len(issues):
        raise ValueError("No valid dated issues or duplicate ids")
    # Missing publisher rows are NOT silently refreshed from an old exchange snapshot.
    warnings.extend(
        [
            data["disclaimer"],
            "Calendar, price and demand are publisher aggregates; not exchange-verified.",
            "GMP Today is a three-issue CC BY 4.0 sample, not full-market coverage.",
            "Ambiguous security types and sub-rupee price units require primary confirmation.",
            "No bid/UPI cutoff, allotment or listing date is inferred from calendar dates.",
            "Excluded source rows: " + json.dumps(excluded, sort_keys=True),
        ]
    )
    return {
        "schemaVersion": 1,
        "generatedAt": observed_at,
        "sourceName": "Xflot publisher calendar + GMP Today sample",
        "sourceURL": "https://www.xflot.com/api-docs",
        "sourceKind": "PUBLISHER_AGGREGATE",
        "disclaimer": data["disclaimer"],
        "attributions": [
            {"name": "Xflot · XDQ Labs", "url": "https://www.xflot.com/api-docs"},
            {"name": "GMP Today · CC BY 4.0", "url": "https://gmptoday.in"},
        ],
        "coverage": {
            "mainboard": "Publisher-tracked Mainboard issues; not exchange-certified completeness",
            "sme": "Publisher-tracked SME issues; undated and conflicted rows excluded",
        },
        "sourceCoverage": {"tracked": data["count"], "included": len(issues), "excluded": excluded},
        "issues": sorted(issues, key=lambda i: (i["closeDate"], i["id"])),
        "warnings": warnings,
    }


class NoRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        raise ValueError("Provider redirect is not permitted")


def cached_fetch(url, cache_path, *, now=None, opener=None):
    if url not in (XFLOT, GMP_TODAY):
        raise ValueError("Unapproved publisher URL")
    now = now or datetime.now(UTC)
    cache_path = Path(cache_path)
    if cache_path.is_symlink():
        raise ValueError("Unsafe provider cache")
    cached = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    last_attempt = stamp(cached.get("attemptedAt"))
    observed = stamp(cached.get("observedAt"))
    if observed and 0 <= (now - observed).total_seconds() < 3600 and cached.get("data"):
        return cached["data"], cached["observedAt"]
    if last_attempt and (now - last_attempt).total_seconds() < 60:
        if observed and 0 <= (now - observed).total_seconds() <= 3 * 3600 and cached.get("data"):
            return cached["data"], cached["observedAt"]
        raise ValueError("Provider retry is rate limited")
    # Reserve the attempt before I/O; a crash cannot produce a burst of duplicate requests.
    cached["attemptedAt"] = now.isoformat()
    atomic(cache_path, cached)
    request = urllib.request.Request(  # noqa: S310 - exact HTTPS allowlist above
        url,
        headers={"Accept": "application/json", "User-Agent": "Atlas-Attributed-IPO-Calendar/1.0"},
    )
    opener = opener or urllib.request.build_opener(NoRedirects())
    with opener.open(request, timeout=12) as response:
        if response.status != 200 or "json" not in response.headers.get("content-type", "").lower():
            raise ValueError("Unexpected publisher response")
        raw = response.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise ValueError("Publisher response exceeds bound")
        data = json.loads(raw)
    observed_at = datetime.now(UTC).isoformat()
    atomic(cache_path, {"attemptedAt": now.isoformat(), "observedAt": observed_at, "data": data})
    return data, observed_at


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--static", action="store_true", help="Also replace the reviewed static fallback"
    )
    args = parser.parse_args()
    STATE.mkdir(mode=0o700, exist_ok=True)
    if STATE.is_symlink():
        raise ValueError("Unsafe runtime directory")
    lock_path = STATE / "ipo-refresh.lock"
    if lock_path.is_symlink():
        raise ValueError("Unsafe refresh lock")
    with lock_path.open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        data, observed_at = cached_fetch(XFLOT, STATE / "ipo-xflot-cache.json")
        try:
            sample, _ = cached_fetch(GMP_TODAY, STATE / "ipo-gmptoday-cache.json")
        except (OSError, ValueError):
            sample = None
        path = STATE / "ipo-feed.json"
        fallback = ROOT / "frontend/public/ipo-feed.json"
        previous = json.loads((path if path.exists() else fallback).read_text())
        snapshot = build_snapshot(data, observed_at=observed_at, gmp_data=sample, previous=previous)
        atomic(path, snapshot)
        if args.static:
            atomic(fallback, snapshot)
        print(
            json.dumps(
                {
                    "status": "published",
                    "observedAt": observed_at,
                    "issues": len(snapshot["issues"]),
                    "coverage": snapshot["sourceCoverage"],
                }
            )
        )


if __name__ == "__main__":
    main()
