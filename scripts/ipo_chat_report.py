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


def build_report(feed, research=None, now=None, max_rows=40):
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
        mandate = parse_time(item.get("mandateDeadline"))
        if mandate is not None and now >= mandate:
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
        if stale:
            signal, reason = "HOLD · SOURCE STALE", "Issue-source update unverified"
        elif stage == "UPCOMING":
            signal, reason = "WATCH", "Bidding has not started; research before applying"
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
                "subscriptionX": multiplier if not stale and finite_number(multiplier) else None,
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
    parser.add_argument("--feed", type=Path, default=DEFAULT_FEED)
    parser.add_argument("--research", type=Path, default=DEFAULT_RESEARCH)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    try:
        feed = json.loads(args.feed.read_text("utf-8"))
        research = json.loads(args.research.read_text("utf-8")) if args.research.is_file() else None
        result = build_report(feed, research)
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
