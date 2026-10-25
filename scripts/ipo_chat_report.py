#!/usr/bin/env python3
"""Produce an attributable Atlas IPO briefing for ChatGPT and CLI reuse.

Read-only and fail-closed. No auto-ordering, credentials, invented financials or GMP.
This report reflects a dated static source snapshot, not a continuous quote feed.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
IST = ZoneInfo("Asia/Kolkata")
DEFAULT_FEED = ROOT / "frontend/public/ipo-feed.json"
DEFAULT_RESEARCH = ROOT / "frontend/public/ipo-primary-research.json"
DEFAULT_REVIEWS = ROOT / "frontend/public/ipo-issuer-reviews.json"


def parse_date(text):
    try:
        return datetime.strptime(text, "%Y-%m-%d").replace(tzinfo=IST).date()
    except (ValueError, TypeError):
        return None


def parse_time(text):
    if not isinstance(text, str):
        return None
    try:
        stamp = datetime.fromisoformat(text.replace("Z", "+00:00"))
        return stamp if stamp.tzinfo is not None else None
    except ValueError:
        return None


def finite_number(value):
    return isinstance(value, (float, int)) and not isinstance(value, bool) and math.isfinite(value)


def valid_research_by_key(research):
    out = {}
    if not isinstance(research, dict) or research.get("schemaVersion") != 1:
        return out
    for row in research.get("records", [])[:100]:
        if not isinstance(row, dict):
            continue
        f = row.get("financials")
        if not isinstance(f, dict):
            continue
        source = str(f.get("source") or "")
        if not source.startswith(
            "https://www.sebi.gov.in/sebi_data/commondocs/"
        ) or not source.lower().endswith(".pdf"):
            continue
        if f.get("valuationVerified") is not False or f.get("peerComparisonVerified") is not False:
            continue
        key = (row.get("id"), row.get("company"), row.get("board"))
        if all(isinstance(z, str) for z in key):
            out[key] = f
    return out


def valid_reviews_by_key(file, now):
    """Accept only pinned primary sources and an exact issuer/board/offer identity."""
    from collections import Counter
    from urllib.parse import urlsplit

    if not isinstance(file, dict) or file.get("schemaVersion") != 1:
        return {}
    rows = file.get("records")
    if not isinstance(rows, list) or len(rows) > 100:
        return {}
    counts = Counter(
        r.get("id") for r in rows if isinstance(r, dict) and isinstance(r.get("id"), str)
    )
    out = {}
    for row in rows:
        try:
            if not isinstance(row, dict) or counts.get(row.get("id")) != 1:
                continue
            key = tuple(row[x] for x in ("id", "company", "board", "openDate", "closeDate"))
            if not all(isinstance(x, str) and 0 < len(x) <= 200 for x in key):
                continue
            if key[2] not in ("MAINBOARD", "SME"):
                continue
            if any(parse_date(x) is None or parse_date(x).isoformat() != x for x in key[3:]):
                continue
            at = parse_time(row.get("reviewedAt"))
            if key[3] > key[4] or at is None or at > now + timedelta(minutes=1):
                continue
            if row.get("stage") not in ("CURRENT_RHP", "DRAFT_ONLY", "SOURCE_GAP"):
                continue
            if row.get("decision") != "HOLD_FOR_MANUAL_REVIEW":
                continue
            if not all(
                isinstance(row.get(k), str) and 0 < len(row[k]) <= 180
                for k in ("basis", "fiscalPeriod")
            ):
                continue
            sources, metrics = row["sources"], row["metrics"]
            if (
                not isinstance(sources, list)
                or len(sources) > 10
                or not isinstance(metrics, list)
                or len(metrics) > 30
            ):
                continue
            catalog = {}
            for source in sources:
                u = urlsplit(source["url"])
                allowed = (
                    (
                        source["kind"] == "REGULATOR"
                        and u.netloc == "www.sebi.gov.in"
                        and u.path.startswith("/sebi_data/")
                    )
                    or (
                        source["kind"] == "LEAD_MANAGER"
                        and (
                            (
                                u.netloc == "shcapl.com"
                                and u.path.startswith("/wp-content/uploads/2026/10/")
                            )
                            or (u.netloc == "www.afsl.co.in" and u.path.startswith("/pdfnew/"))
                        )
                    )
                    or (
                        source["kind"] == "ISSUER"
                        and (
                            (u.netloc == "core4engineers.com" and u.path.startswith("/pdf/ipo/"))
                            or (
                                u.netloc == "www.mkjewels.in"
                                and u.path.startswith("/uploads/mkjewels/pdf/")
                            )
                        )
                    )
                )
                if (
                    not allowed
                    or u.scheme != "https"
                    or u.query
                    or u.fragment
                    or not u.path.lower().endswith(".pdf")
                ):
                    raise ValueError("Unsupported research source")
                digest, pages = source["sha256"], source["pages"]
                if (
                    not isinstance(digest, str)
                    or len(digest) != 64
                    or any(c not in "0123456789abcdef" for c in digest)
                ):
                    raise ValueError("Unpinned source")
                if (
                    not isinstance(pages, list)
                    or not 0 < len(pages) <= 60
                    or not all(type(p) is int and 0 < p <= 1500 for p in pages)
                ):
                    raise ValueError("Invalid physical page")
                if not isinstance(source["id"], str) or source["id"] in catalog:
                    raise ValueError("Ambiguous source")
                if (
                    not 0 < len(source["id"]) <= 60
                    or not isinstance(source["document"], str)
                    or not 0 < len(source["document"]) <= 120
                ):
                    raise ValueError("Invalid source identity")
                catalog[source["id"]] = source
            seen = set()
            for m in metrics:
                if not isinstance(m, dict) or m["key"] in seen or not finite_number(m["value"]):
                    raise ValueError("Invalid financial number")
                if (
                    not isinstance(m["key"], str)
                    or not 0 < len(m["key"]) <= 60
                    or type(m["page"]) is not int
                ):
                    raise ValueError("Invalid metric identity")
                seen.add(m["key"])
                if m["unit"] not in ("INR_CR", "INR_PER_SHARE", "PCT", "RATIO", "DAYS"):
                    raise ValueError("Invalid financial unit")
                if (
                    parse_date(m["periodEnd"]) is None
                    or parse_date(m["periodEnd"]).isoformat() != m["periodEnd"]
                ):
                    raise ValueError("Invalid financial period")
                if m["page"] not in catalog[m["sourceId"]]["pages"]:
                    raise ValueError("Unattributed financial number")
                if not isinstance(m["label"], str) or not 0 < len(m["label"]) <= 100:
                    raise ValueError("Invalid financial label")
            for field in ("risks", "gaps"):
                vals = row[field]
                if (
                    not isinstance(vals, list)
                    or len(vals) > 12
                    or not all(isinstance(v, str) and 0 < len(v) <= 400 for v in vals)
                ):
                    raise ValueError("Invalid research notes")
            if not row["gaps"]:
                continue
            if row["stage"] == "CURRENT_RHP" and (
                not row["risks"]
                or not any(s["document"] in ("RHP", "ABRIDGED_RHP") for s in sources)
            ):
                continue
            peer = row["peerContext"]
            if peer is not None:
                if (
                    parse_date(peer["priceAsOf"]) is None
                    or peer["page"] not in catalog[peer["sourceId"]]["pages"]
                ):
                    continue
                if not isinstance(peer["note"], str) or not 0 < len(peer["note"]) <= 400:
                    continue
                if not isinstance(peer["peers"], list) or not 0 < len(peer["peers"]) <= 10:
                    continue
                if not all(
                    isinstance(p["company"], str)
                    and finite_number(p["reportedPE"])
                    and p["reportedPE"] > 0
                    for p in peer["peers"]
                ):
                    continue
            if row["stage"] == "SOURCE_GAP" and (sources or metrics or peer is not None):
                continue
            out[key] = row
        except (KeyError, TypeError, ValueError, AttributeError):
            continue
    return out


def review_summary(row, item, stale):
    eps = next(
        (
            m
            for m in row["metrics"]
            if m["key"] == "dilutedEPS"
            and m["unit"] == "INR_PER_SHARE"
            and m["periodEnd"] == "2026-03-31"
        ),
        None,
    )
    low, high = item.get("priceMin"), item.get("priceMax")
    scenario = None
    if (
        not stale
        and row["stage"] == "CURRENT_RHP"
        and eps
        and eps["value"] > 0
        and finite_number(low)
        and finite_number(high)
        and 0 < low <= high
    ):
        if not finite_number(low / eps["value"]) or not finite_number(high / eps["value"]):
            return {**row, "historicalPEScenario": None}
        scenario = {
            "low": low / eps["value"],
            "high": high / eps["value"],
            "eps": eps["value"],
            "basis": row["basis"],
            "preOffer": True,
            "fairValueVerified": False,
        }
    return {
        "stage": row["stage"],
        "basis": row["basis"],
        "fiscalPeriod": row["fiscalPeriod"],
        "reviewedAt": row["reviewedAt"],
        "metrics": row["metrics"],
        "risks": row["risks"],
        "gaps": row["gaps"],
        "sources": row["sources"],
        "peerContext": row["peerContext"],
        "historicalPEScenario": scenario,
        "decision": "HOLD_FOR_MANUAL_REVIEW",
    }


def build_report(feed, research=None, now=None, max_rows=40, reviews=None):
    now = now or datetime.now(IST)
    if now.tzinfo is None:
        raise ValueError("now must carry a timezone")
    if (
        not isinstance(feed, dict)
        or feed.get("schemaVersion") != 1
        or not isinstance(feed.get("issues"), list)
    ):
        raise ValueError("Untrusted or missing IPO feed")
    stamp = parse_time(feed.get("generatedAt"))
    if stamp is None:
        raise ValueError("Unverified snapshot timestamp")
    fresh = timedelta(minutes=180)
    age = now - stamp
    feed_stale = age > fresh or age < timedelta(minutes=-1)
    local_day = now.astimezone(IST).date()
    research_by_key = valid_research_by_key(research)
    reviews_by_key = valid_reviews_by_key(reviews, now)
    entries = []
    for item in feed["issues"][:250]:
        if not isinstance(item, dict):
            continue
        company, symbol, board = item.get("company"), item.get("id"), item.get("board")
        first, last = parse_date(item.get("openDate")), parse_date(item.get("closeDate"))
        if (
            not isinstance(company, str)
            or not isinstance(symbol, str)
            or board not in ("SME", "MAINBOARD")
        ):
            continue
        if first is None or last is None or first > last:
            continue
        stage = "UPCOMING" if local_day < first else "CLOSED" if local_day > last else "OPEN"
        for field in ("bidDeadline", "mandateDeadline"):
            deadline = parse_time(item.get(field))
            if deadline is not None and now >= deadline:
                stage = "CLOSED"
        if item.get("status") == "CLOSED":
            stage = "CLOSED"
        if stage == "CLOSED":
            continue
        observed = parse_time(item.get("sourceObservedAt")) or stamp
        stale = (
            feed_stale
            or item.get("sourceStale") is True
            or (now - observed) > fresh
            or (now - observed) < timedelta(minutes=-1)
        )
        funding = research_by_key.get((symbol, company, board))
        review = reviews_by_key.get((symbol, company, board, item["openDate"], item["closeDate"]))
        if stale:
            signal, reason = "HOLD · SOURCE STALE", "Issue-source update unverified"
        elif stage == "UPCOMING":
            signal, reason = "WATCH", "Bidding has not started; research before applying"
        elif review is not None and review["stage"] == "CURRENT_RHP":
            signal, reason = (
                "HOLD · MANUAL VALUATION REVIEW",
                "Issuer filing reviewed; disclosed risks and valuation gaps require manual review",
            )
        elif funding is not None:
            signal, reason = (
                "HOLD · VALUATION REVIEW",
                "Official issuer financials available; peer valuation incomplete",
            )
        else:
            signal, reason = (
                "HOLD · INCOMPLETE RESEARCH",
                "Financials, valuation, risk review incomplete",
            )
        subscription = (
            item.get("subscription") if isinstance(item.get("subscription"), dict) else {}
        )
        multiplier = subscription.get("total")
        demand_stamp = parse_time(item.get("subscriptionAsOf"))
        demand_fresh = not stale and (
            item.get("sourceKind") != "PUBLISHER_AGGREGATE"
            or (demand_stamp is not None and timedelta(minutes=-1) <= now - demand_stamp <= fresh)
        )
        price = item.get("priceMax")
        lot = item.get("lotSize")
        gmp = item.get("gmp")
        gmp_asof = parse_time(item.get("gmpAsOf"))
        gmp_usable = (
            not stale
            and finite_number(gmp)
            and gmp_asof is not None
            and timedelta(minutes=-1) <= now - gmp_asof <= timedelta(hours=36)
        )
        entries.append(
            {
                "id": symbol,
                "company": company,
                "board": board,
                "stage": stage,
                "opens": first.isoformat(),
                "closes": last.isoformat(),
                "decision": signal,
                "reason": reason,
                "subscriptionX": multiplier if demand_fresh and finite_number(multiplier) else None,
                "priceMaxINR": price if finite_number(price) else None,
                "lotSize": lot if isinstance(lot, int) and lot > 0 else None,
                "unofficialGmpINR": gmp if gmp_usable else None,
                "gmpProvider": item.get("gmpProvider") if gmp_usable else None,
                "gmpObservedAt": gmp_asof.astimezone(IST).isoformat(timespec="minutes")
                if gmp_usable
                else None,
                "gmpDisputed": item.get("gmpDisputed") is True if gmp_usable else False,
                "sourceURL": item.get("detailSource")
                if str(item.get("detailSource", "")).startswith("https://")
                else None,
                "officialFinancialsURL": funding.get("source") if funding else None,
                "issuerReview": review_summary(review, item, stale) if review else None,
                "sourceStale": stale,
                "daysUntilClose": (last - local_day).days,
            }
        )
    entries.sort(key=lambda x: (x["closes"], x["board"], x["company"]))
    return {
        "asOfIST": now.astimezone(IST).isoformat(timespec="minutes"),
        "snapshotUTC": stamp.astimezone(UTC).isoformat(timespec="seconds"),
        "feedStale": feed_stale,
        "coverage": feed.get("coverage", {}),
        "totalUpcomingAndOpen": len(entries),
        "issues": entries[:max_rows],
        "notes": [
            "No capital orders are placed. GMP is unofficial. Missing metrics are not zero.",
            "Application cutoffs can precede the closing date; check exchange/issuer and broker.",
        ],
    }


def markdown_report(data):
    lines = [
        f"# Atlas IPO research briefing — {data['asOfIST']} IST",
        (
            f"IPO feed snapshot: {data['snapshotUTC']} UTC · "
            f"{'STALE' if data['feedStale'] else 'source observed'}"
        ),
        f"Open/upcoming issues in snapshot: {data['totalUpcomingAndOpen']}",
        "",
        "| Board | Company | Closes | Price cap | Subscription | Unofficial GMP | Atlas decision |",
        "|---|---|---|---:|---:|---:|---|",
    ]
    for r in data["issues"]:
        price = "—" if r["priceMaxINR"] is None else f"₹{r['priceMaxINR']:,.2f}"
        sub = "—" if r["subscriptionX"] is None else f"{r['subscriptionX']:,.2f}x"
        gmp = (
            "—"
            if r["unofficialGmpINR"] is None
            else (
                f"₹{r['unofficialGmpINR']:,.2f} ({r['gmpProvider']}, "
                f"{r['gmpObservedAt']} IST{' · disputed' if r['gmpDisputed'] else ''})"
            )
        )
        lines.append(
            f"| {r['board']} | {r['company']} | {r['closes']} | {price} | "
            f"{sub} | {gmp} | {r['decision']} |"
        )
    lines += [
        "",
        "Deadlines within 24 hours (calendar-date warning, not a verified exact broker time):",
    ]
    near = [r for r in data["issues"] if r["stage"] == "OPEN" and r["daysUntilClose"] <= 1]
    if near:
        for r in near:
            lines.append(
                f"- {r['company']} closes {r['closes']}; verify broker/UPI cutoff "
                f"({r['sourceURL'] or 'official exchange site'})."
            )
    else:
        lines.append("- None verified in this snapshot.")
    lines += ["", "Status notes:"] + ["- " + x for x in data["notes"]]
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(
        description="Offline/verified snapshot IPO briefing for ChatGPT"
    )
    parser.add_argument("--feed", type=Path)
    parser.add_argument("--research", type=Path, default=DEFAULT_RESEARCH)
    parser.add_argument("--reviews", type=Path, default=DEFAULT_REVIEWS)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    try:
        if args.feed:
            feed = json.loads(args.feed.read_text("utf-8"))
        else:
            candidates = []
            for path in [ROOT / ".atlas-runtime/ipo-feed.json", DEFAULT_FEED]:
                try:
                    if path.is_symlink() or path.stat().st_size > 500_000:
                        continue
                    item = json.loads(path.read_text("utf-8"))
                    timestamp = parse_time(item.get("generatedAt"))
                    if timestamp and timestamp <= datetime.now(UTC) + timedelta(minutes=1):
                        candidates.append((timestamp, item))
                except (OSError, ValueError, TypeError):
                    continue
            if not candidates:
                raise ValueError("No attributable snapshot available")
            feed = max(candidates, key=lambda item: item[0])[1]
        research = json.loads(args.research.read_text("utf-8")) if args.research.is_file() else None
        reviews = json.loads(args.reviews.read_text("utf-8")) if args.reviews.is_file() else None
        result = build_report(feed, research, reviews=reviews)
        print(
            json.dumps(result, ensure_ascii=False, indent=2)
            if args.json
            else markdown_report(result)
        )
    except (OSError, ValueError, TypeError) as error:
        print("Atlas IPO briefing withheld: " + str(error), file=sys.stderr)
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
