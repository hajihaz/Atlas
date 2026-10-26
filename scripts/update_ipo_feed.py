#!/usr/bin/env python3
"""Read-only NSE IPO research snapshot. No orders, credentials or anti-bot bypasses.

Undocumented exchange website endpoints can change; fail closed on schema/network errors.
Follow the exchange's applicable access/data licensing terms before unattended redistribution.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from pathlib import Path
from xml.etree import ElementTree

BASE = "https://www.nseindia.com"
LIST_URL = BASE + "/api/all-upcoming-issues?category=ipo"
DETAIL_URL = BASE + "/api/ipo-detail?symbol="
DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "frontend/public/ipo-feed.json"
IST = timezone(timedelta(hours=5, minutes=30))
HEADERS = {
    "Accept": "application/json",
    "User-Agent": "Atlas IPO Research (read-only; contact repository maintainers)",
}


def get_json(url: str, timeout: int = 9):
    # Fail closed on unexpected URL schemes and endpoints before requesting public data.
    parts = urllib.parse.urlsplit(url)
    if (
        parts.scheme != "https"
        or parts.hostname not in ("www.nseindia.com", "www.xflot.com", "gmptoday.in")
        or not parts.path.startswith("/api/")
        or (
            parts.hostname == "www.xflot.com"
            and not parts.path.startswith("/api/public/market/ipos")
        )
    ):
        raise ValueError("Untrusted IPO provider URL")
    if parts.hostname == "www.nseindia.com":
        raise ValueError(
            "NSE website collection is disabled: a separately permitted IPO source is required"
        )
    request = urllib.request.Request(url, headers=HEADERS)  # noqa: S310 - validated HTTPS IPO provider endpoint
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 - validated HTTPS IPO provider endpoint
        if response.status != 200 or "json" not in response.headers.get("content-type", "").lower():
            raise ValueError("Unexpected NSE response type")
        return json.load(response)


def date_iso(text):
    try:
        return datetime.strptime(text, "%d-%b-%Y").replace(tzinfo=IST).date().isoformat()
    except (TypeError, ValueError):
        return None


def as_number(value):
    try:
        result = float(str(value).replace(",", ""))
        if result != result or abs(result) == float("inf") or result < 0:
            return None
        return round(result, 4)
    except (ValueError, TypeError):
        return None


def price_band(text):
    values = [float(x.replace(",", "")) for x in re.findall(r"\d[\d,]*(?:\.\d+)?", str(text))]
    return (min(values), max(values)) if values and len(values) <= 2 else (None, None)


def summary_categories(data):
    result = {"qib": None, "nii": None, "retail": None, "individual": None, "total": None}
    for row in data if isinstance(data, list) else []:
        label = str(row.get("category") or "").lower()
        number = as_number(row.get("noOfTime"))
        if number is None:
            continue
        if label.strip() == "total":
            result["total"] = number
        elif label.startswith("qualified institutional"):
            result["qib"] = number
        elif label == "non institutional investors":
            result["nii"] = number
        elif label.startswith("retail individual"):
            result["retail"] = number
        elif label.startswith("individual investors"):
            result["individual"] = number
    return result


def transform_issue(item):
    if not isinstance(item, dict):
        return None
    symbol = str(item.get("symbol") or "").strip().upper()
    company = str(item.get("companyName") or "").strip()
    start = date_iso(item.get("issueStartDate"))
    end = date_iso(item.get("issueEndDate"))
    if (
        not re.fullmatch(r"[A-Z0-9-]{2,30}", symbol)
        or not company
        or not start
        or not end
        or end < start
    ):
        return None
    board = (
        "SME"
        if str(item.get("series", "")).upper() == "SME"
        else "MAINBOARD"
        if str(item.get("series", "")).upper() == "EQ"
        else None
    )
    if board is None:
        return None
    minimum, maximum = price_band(item.get("issuePrice"))
    status = str(item.get("status") or "").lower()
    if "active" in status:
        status = "OPEN"
    elif "forthcoming" in status or "upcoming" in status:
        status = "UPCOMING"
    elif "closed" in status:
        status = "CLOSED"
    else:
        status = "UNKNOWN"
    return {
        "id": symbol,
        "company": company[:180],
        "board": board,
        "openDate": start,
        "closeDate": end,
        "status": status,
        "priceMin": minimum,
        "priceMax": maximum,
        "lotSize": None,
        "subscription": {
            "qib": None,
            "nii": None,
            "retail": None,
            "individual": None,
            "total": None,
        },
        "gmp": None,
        "gmpAsOf": None,
        "gmpProvider": None,
        "gmpReadings": [],
        "gmpDisputed": False,
        "gmpSources": None,
        "gmpEstimatedGainPct": None,
        "gmpHistory": [],
        "registrar": None,
        "rhpUrl": None,
        "priceJustificationUrl": None,
        "financials": None,
        "news": [],
        "detailSource": BASE
        + "/market-data/issue-information?symbol="
        + urllib.parse.quote(symbol),
        "source": LIST_URL,
        "mandateDeadline": None,
        "bidDeadline": None,
    }


def parse_mandate_deadline(raw):
    match = re.search(
        r"(\d{2}-[A-Za-z]{3}-\d{4}).{0,50}?(?:upto|up to)\s*(\d{1,2}):(\d{2})\s*(AM|PM)",
        str(raw),
        re.I,
    )
    if not match:
        return None
    day = date_iso(match.group(1))
    if not day:
        return None
    hour = int(match.group(2)) % 12 + (12 if match.group(4).upper() == "PM" else 0)
    minute = int(match.group(3))
    if hour > 23 or minute > 59:
        return None
    return f"{day}T{hour:02d}:{minute:02d}:00+05:30"


def enrich_detail(issue):
    detail = get_json(DETAIL_URL + urllib.parse.quote(issue["id"]), timeout=7)
    if not isinstance(detail, dict):
        return
    issue["subscription"] = summary_categories(detail.get("bidDetails"))
    listing = detail.get("issueInfo") or {}
    rows = listing.get("dataList") if isinstance(listing, dict) else []
    for x in rows if isinstance(rows, list) else []:
        if not isinstance(x, dict):
            continue
        title = str(x.get("title") or "").strip().lower()
        value = str(x.get("value") or "")
        if title == "name of the registrar":
            issue["registrar"] = value[:180] if value.strip() else None
        if title == "red herring prospectus" and value.startswith(
            "https://nsearchives.nseindia.com/content/ipo/"
        ):
            issue["rhpUrl"] = value.strip()
        if title == "ratios / basis of issue price" and value.startswith(
            "https://nsearchives.nseindia.com/content/ipo/"
        ):
            issue["priceJustificationUrl"] = value.strip()
        if "cut-off time for upi mandate" in title:
            issue["mandateDeadline"] = parse_mandate_deadline(value)
        if title in ("bid lot", "market lot", "bid lot size"):
            match = re.search(r"\d[\d,]*", value)
            if match:
                issue["lotSize"] = int(match.group().replace(",", ""))
    # Individual IPO cutoffs can differ from generalized exchange windows.
    # No inferred exact bid or mandate deadline is published.


BSE_SME_URL = "https://www.bsesme.com/PublicIssues/PublicIssues.aspx?id=2"
GMP_TODAY_URL = "https://gmptoday.in/api/gmp.json"
XFLOT_URL = "https://www.xflot.com/api/public/market/ipos?limit=200"
ACCURACY_URL = "https://gmptoday.in/api/accuracy.json"


class BseSmeTable(HTMLParser):
    """Extract only the BSE SME Public Issues grid; never infer prices or applications."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.inside = False
        self.in_row = False
        self.in_cell = False
        self.cells = []
        self.rows = []
        self.href = None
        self.row_href = None
        self.text = ""

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "table" and attrs.get("id") == "ContentPlaceHolder1_tblID":
            self.inside = True
        elif self.inside and tag == "tr":
            self.in_row = True
            self.cells = []
            self.row_href = None
        elif self.in_row and tag in ("td", "th"):
            self.in_cell = True
            self.text = ""
        elif self.in_cell and tag == "a":
            self.row_href = attrs.get("href") or self.row_href

    def handle_data(self, data):
        if self.in_cell:
            self.text += data

    def handle_endtag(self, tag):
        if self.in_cell and tag in ("td", "th"):
            self.cells.append(" ".join(self.text.split()))
            self.in_cell = False
        elif self.in_row and tag == "tr":
            if len(self.cells) >= 4 and self.row_href:
                self.rows.append((self.cells, self.row_href))
            self.in_row = False
        elif self.inside and tag == "table":
            self.inside = False


def recent_bse_sme(now=None, html_text=None):
    if html_text is None:
        request = urllib.request.Request(
            BSE_SME_URL, headers={"User-Agent": "Atlas IPO Research (read-only)"}
        )
        with urllib.request.urlopen(request, timeout=10) as response:  # noqa: S310 - fixed HTTPS BSE endpoint
            if response.status != 200:
                raise ValueError("BSE source error")
            html_text = response.read(650_000).decode("utf-8", "replace")
    parser = BseSmeTable()
    parser.feed(html_text)
    results = []
    today = now or datetime.now(IST).date()
    for cells, url in parser.rows:
        if not re.search(r"[?&]type=IPO(?:&|$)", url, re.I):
            continue
        if not url.startswith("https://www.bseindia.com/markets/publicIssues/DisplayIPO.aspx?"):
            continue
        try:
            start = datetime.strptime(cells[1], "%d-%m-%Y").replace(tzinfo=IST).date()
            end = datetime.strptime(cells[2], "%d-%m-%Y").replace(tzinfo=IST).date()
        except (ValueError, IndexError):
            continue
        if end < today - timedelta(days=35) or start > today + timedelta(days=360):
            continue
        match = re.search(r"[?&]IPONo=(\d+)", url, re.I)
        if not match:
            continue
        low, high = price_band(cells[3])
        name = cells[0][:180]
        if not name or low is None:
            continue
        item = {
            "id": "BSESME-" + match.group(1),
            "company": name,
            "board": "SME",
            "openDate": start.isoformat(),
            "closeDate": end.isoformat(),
            "status": "UPCOMING" if start > today else "CLOSED" if end < today else "OPEN",
            "priceMin": low,
            "priceMax": high,
            "lotSize": None,
            "subscription": {
                "qib": None,
                "nii": None,
                "retail": None,
                "individual": None,
                "total": None,
            },
            "gmp": None,
            "gmpAsOf": None,
            "gmpProvider": None,
            "gmpReadings": [],
            "gmpDisputed": False,
            "gmpSources": None,
            "gmpEstimatedGainPct": None,
            "gmpHistory": [],
            "registrar": None,
            "rhpUrl": None,
            "priceJustificationUrl": None,
            "financials": None,
            "news": [],
            "detailSource": url,
            "source": BSE_SME_URL,
            "bidDeadline": None,
            "mandateDeadline": None,
        }
        results.append(item)
    return results[:75]


def company_key(value):
    text = re.sub(r"[^a-z0-9 ]", " ", str(value).lower())
    words = [w for w in text.split() if w not in ("limited", "ltd", "ipo", "public", "issue")]
    return "".join(words)


def valid_quote(value):
    try:
        result = float(value)
        return round(result, 2) if math.isfinite(result) and abs(result) <= 100000 else None
    except (ValueError, TypeError):
        return None


def fresh_timestamp(raw, now=None, max_hours=36):
    if not isinstance(raw, str) or not raw.strip():
        return None
    try:
        observed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if observed.tzinfo is None:
            return None
        current = now or datetime.now(UTC)
        age = (current - observed.astimezone(UTC)).total_seconds() / 3600
        return observed.isoformat() if -0.25 <= age <= max_hours else None
    except ValueError:
        return None


def match_issue(issue, record, source):
    if not isinstance(record, dict):
        return False
    board = str(record.get("board") if source == "Xflot" else record.get("type", "")).upper()
    if board not in ("MAINBOARD", "SME") or issue["board"] != board:
        return False
    closing = record.get("closeDate") if source == "Xflot" else record.get("close_date")
    if isinstance(closing, str) and closing[:10] != issue["closeDate"]:
        return False
    symbol = str(record.get("symbol") or "").upper().strip()
    if source == "Xflot" and symbol and issue["id"] == symbol:
        return True
    target = company_key(record.get("name"))
    return bool(target) and target == company_key(issue["company"])


def parse_xflot(data, now=None):
    if (
        not isinstance(data, dict)
        or data.get("ok") is not True
        or not isinstance(data.get("ipos"), list)
    ):
        raise ValueError("Xflot schema changed")
    result = []
    for item in data["ipos"][:200]:
        if not isinstance(item, dict):
            continue
        gmp = valid_quote(item.get("lastGmp"))
        asof = fresh_timestamp(item.get("updatedAt"), now)
        if gmp is None or not asof:
            continue
        result.append(
            {
                "record": item,
                "provider": "Xflot",
                "gmp": gmp,
                "asOf": asof,
                "url": "https://www.xflot.com/api-docs",
                "sources": int(item.get("gmpSources") or 0),
                "disputed": bool(item.get("gmpDisputed")),
                "range": None,
                "attribution": "Xflot · XDQ Labs; unofficial reported GMP",
            }
        )
    return result


def parse_gmptoday(data, now=None):
    if (
        not isinstance(data, dict)
        or data.get("license") != "CC-BY-4.0"
        or not isinstance(data.get("ipos"), list)
    ):
        raise ValueError("GMP Today schema/license changed")
    asof = fresh_timestamp(data.get("updated_at") or data.get("generated_at"), now)
    if not asof:
        return []
    result = []
    for item in data["ipos"][:10]:
        if not isinstance(item, dict):
            continue
        gmp = valid_quote(item.get("gmp_median"))
        if gmp is None:
            continue
        low, high = valid_quote(item.get("gmp_min")), valid_quote(item.get("gmp_max"))
        result.append(
            {
                "record": item,
                "provider": "GMP Today",
                "gmp": gmp,
                "asOf": asof,
                "url": "https://gmptoday.in",
                "sources": int(item.get("gmp_sources") or 0),
                "disputed": bool(
                    low is not None and high is not None and (high - low) > max(abs(gmp) * 0.5, 10)
                ),
                "range": [low, high] if low is not None and high is not None else None,
                "attribution": "Data: gmptoday.in · CC BY 4.0; unofficial aggregated GMP",
            }
        )
    return result


def add_unofficial_gmp(issues, errors):
    readings = []
    for provider, url, parser in [
        ("GMP Today", GMP_TODAY_URL, parse_gmptoday),
        ("Xflot", XFLOT_URL, parse_xflot),
    ]:
        try:
            readings.extend(parser(get_json(url, timeout=11)))
        except (urllib.error.URLError, ValueError, TimeoutError, json.JSONDecodeError) as error:
            errors.append(provider + " GMP: " + type(error).__name__)
    for issue in issues:
        if issue.get("sourceStale"):
            # Unofficial premiums never renew an issue whose exchange listing is stale.
            continue
        matches = [r for r in readings if match_issue(issue, r["record"], r["provider"])]
        # Match only the official issue, board and date; never add unsourced IPOs.
        if not matches:
            continue
        chosen = next((r for r in matches if r["provider"] == "GMP Today"), matches[0])
        values = [r["gmp"] for r in matches]
        disagreements = (
            (max(values) - min(values)) > max(max(abs(x) for x in values) * 0.5, 10)
            if len(values) > 1
            else False
        )
        issue["gmp"] = chosen["gmp"]
        issue["gmpProvider"] = chosen["provider"]
        issue["gmpAsOf"] = chosen["asOf"]
        issue["gmpDisputed"] = disagreements or any(r["disputed"] for r in matches)
        issue["gmpSources"] = chosen["sources"]
        issue["gmpEstimatedGainPct"] = (
            round(100 * chosen["gmp"] / issue["priceMax"], 2) if issue["priceMax"] else None
        )
        issue["gmpReadings"] = [
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
        ]
        # An aggregate contributor may have a historical series; it is never official exchange data.
        xf = next(
            (r for r in matches if r["provider"] == "Xflot" and r["record"].get("slug")), None
        )
        if xf and issue["status"] in ("OPEN", "UPCOMING"):
            slug = str(xf["record"]["slug"])
            if re.fullmatch(r"[a-z0-9-]{2,120}", slug):
                try:
                    detail = get_json(
                        "https://www.xflot.com/api/public/market/ipos/" + slug, timeout=9
                    )
                    if (
                        detail.get("ok") is True
                        and isinstance(detail.get("ipo"), dict)
                        and match_issue(issue, detail["ipo"], "Xflot")
                    ):
                        points = []
                        for line in (detail["ipo"].get("gmp") or [])[:100]:
                            if not isinstance(line, dict):
                                continue
                            observed = fresh_timestamp(line.get("observedAt"), max_hours=2000)
                            price = valid_quote(line.get("gmp"))
                            if observed and price is not None:
                                points.append(
                                    {
                                        "observedAt": observed,
                                        "gmp": price,
                                        "source": "Xflot, reported "
                                        + str(line.get("source") or "third-party")[:40],
                                    }
                                )
                        issue["gmpHistory"] = sorted(points, key=lambda x: x["observedAt"])[-60:]
                except (
                    ValueError,
                    urllib.error.URLError,
                    TimeoutError,
                    json.JSONDecodeError,
                ) as error:
                    errors.append(issue["id"] + " GMP history: " + type(error).__name__)
    return len(readings)


def build_gmp_accuracy(data):
    if (
        not isinstance(data, dict)
        or not str(data.get("licence", "")).startswith("CC BY 4.0")
        or not isinstance(data.get("rows"), list)
    ):
        raise ValueError("Accuracy audit schema/license changed")
    summary = data.get("summary") or {}
    records = []
    for item in data["rows"][:500]:
        if not isinstance(item, dict):
            continue
        actual = valid_quote(item.get("actual_pct"))
        predicted = valid_quote(item.get("predicted_pct"))
        if actual is None or predicted is None:
            continue
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        records.append(
            {
                "company": name[:150],
                "board": str(item.get("type") or "UNKNOWN").upper(),
                "listedOn": str(item.get("listed_date") or ""),
                "predictedPct": predicted,
                "actualPct": actual,
                "gmpAtClose": valid_quote(item.get("final_gmp")),
                "priceIssue": valid_quote(item.get("issue_price")),
                "priceListing": valid_quote(item.get("listing_price")),
            }
        )
    count = summary.get("n")
    if not isinstance(count, int) or count < 0:
        raise ValueError("Accuracy count missing")
    return {
        "schemaVersion": 1,
        "source": "https://gmptoday.in/accuracy/",
        "sourceAPI": ACCURACY_URL,
        "license": "CC BY 4.0",
        "attribution": "Historical IPO GMP audit compiled by gmptoday.in",
        "generatedAt": data.get("generated_at"),
        "totalPublished": count,
        "sourceDirectionAccuracyPct": valid_quote(summary.get("direction_strict_pct")),
        "sourceAverageAbsoluteErrorPctPoints": valid_quote(summary.get("avg_error")),
        "scopeWarning": (
            "Self-published third-party audit; not independently validated. "
            "Small SME sample limits conclusions."
        ),
        "rows": records[:60],
    }


def retained_sme(previous, today=None, max_age_days=7):
    """Keep previously observed BSE issues with explicit staleness when BSE fails.

    Never present an old quotation or subscription as current. Bound retention to
    prevent permanent phantom active issues and avoid importing arbitrary schemas.
    """
    if not isinstance(previous, dict) or previous.get("schemaVersion") != 1:
        return []
    today = today or datetime.now(IST).date()
    observed = previous.get("generatedAt")
    try:
        snapshot_time = datetime.fromisoformat(str(observed).replace("Z", "+00:00"))
        if snapshot_time.tzinfo is None or snapshot_time > datetime.now(UTC):
            return []
    except (TypeError, ValueError):
        return []
    retained = []
    for item in previous.get("issues") if isinstance(previous.get("issues"), list) else []:
        if (
            not isinstance(item, dict)
            or item.get("board") != "SME"
            or item.get("source") != BSE_SME_URL
        ):
            continue
        if not re.fullmatch(r"BSESME-\d{1,12}", str(item.get("id", ""))) or not str(
            item.get("detailSource", "")
        ).startswith("https://www.bseindia.com/markets/publicIssues/DisplayIPO.aspx?"):
            continue
        try:
            last_seen = datetime.fromisoformat(
                str(item.get("sourceObservedAt") or observed).replace("Z", "+00:00")
            )
            if (
                last_seen.tzinfo is None
                or last_seen > datetime.now(UTC)
                or (datetime.now(UTC) - last_seen).days >= max_age_days
            ):
                continue
            closes = datetime.strptime(item["closeDate"], "%Y-%m-%d").replace(tzinfo=IST).date()
            opens = datetime.strptime(item["openDate"], "%Y-%m-%d").replace(tzinfo=IST).date()
            if (
                closes < today - timedelta(days=35)
                or opens > today + timedelta(days=360)
                or closes < opens
            ):
                continue
        except (TypeError, ValueError, KeyError):
            continue
        safe = {
            **item,
            "sourceObservedAt": last_seen.isoformat(),
            "sourceStale": True,
            "subscription": {
                "qib": None,
                "nii": None,
                "retail": None,
                "individual": None,
                "total": None,
            },
            "gmp": None,
            "gmpAsOf": None,
            "gmpReadings": [],
            "gmpHistory": [],
            "gmpEstimatedGainPct": None,
            "gmpProvider": None,
            "gmpSources": None,
            "gmpDisputed": False,
        }
        retained.append(safe)
    return retained[:75]


NEWS_RSS_BASE = "https://news.google.com/rss/search"
NEWS_SOURCES = {
    "reuters",
    "livemint",
    "mint",
    "economic times",
    "the economic times",
    "moneycontrol.com",
    "moneycontrol",
    "business standard",
    "financial express",
    "cnbc tv18",
    "cnbc-tv18",
    "ndtv profit",
    "business today",
    "value research",
}


def recent_ipo_news(issue, now=None, rss_data=None):
    """Verified issuer-name matching of public RSS *headlines*, never news article bodies.

    This is a curated reference list, not an Atlas validation of the articles' claims.
    It must not be treated as proof of profits, financials or issuer disclosures.
    """
    now = now or datetime.now(UTC)
    if rss_data is None:
        query = urllib.parse.urlencode(
            {
                "q": issue["company"][:110] + " IPO when:14d",
                "hl": "en-IN",
                "gl": "IN",
                "ceid": "IN:en",
            }
        )
        req = urllib.request.Request(  # noqa: S310 - hardcoded HTTPS Google News origin, query url-encoded
            NEWS_RSS_BASE + "?" + query,
            headers={"User-Agent": "Atlas IPO Research (read-only)"},
        )
        with urllib.request.urlopen(req, timeout=7) as response:  # noqa: S310 - fixed Google News RSS origin
            if response.status != 200:
                raise ValueError("News RSS provider returned an error")
            rss_data = response.read(180_000)
    if b"<!DOCTYPE" in rss_data.upper() or b"<!ENTITY" in rss_data.upper():
        raise ValueError("Unsafe XML declarations are forbidden")
    root = ElementTree.fromstring(rss_data)  # noqa: S314 - bounded RSS, explicit DTD/entity rejection
    if root.tag != "rss":
        raise ValueError("Unexpected Google News RSS response")
    name_tokens = [
        t.lower()
        for t in re.findall(r"[A-Za-z0-9]+", issue["company"])
        if t.lower() not in ("limited", "ltd", "india", "private", "pvt")
    ]
    if not name_tokens:
        return []
    # Require at least two meaningful issuer tokens where possible, not IPO-only headlines.
    keys = name_tokens[:2]
    kept = []
    seen = set()
    for element in root.findall("./channel/item")[:35]:
        title = " ".join((element.findtext("title") or "").split())[:220]
        source = " ".join((element.findtext("source") or "").split())[:70]
        canonical = re.sub(r"[^a-z0-9]", " ", title.lower()).split()
        canonical_text = " ".join(canonical)
        if "ipo" not in canonical or not all(t in canonical_text for t in keys):
            continue
        if source.lower() not in NEWS_SOURCES or title.lower() in seen:
            continue
        url = (element.findtext("link") or "").strip()
        if not url.startswith("https://news.google.com/rss/articles/") or len(url) > 2048:
            continue
        try:
            publish = parsedate_to_datetime(element.findtext("pubDate") or "")
            if publish.tzinfo is None:
                continue
            publish = publish.astimezone(UTC)
            if publish > now + timedelta(minutes=5) or now - publish > timedelta(days=14):
                continue
        except (TypeError, ValueError):
            continue
        seen.add(title.lower())
        kept.append(
            {
                "title": title,
                "source": source,
                "url": url,
                "publishedAt": publish.isoformat(timespec="seconds").replace("+00:00", "Z"),
            }
        )
    return sorted(kept, key=lambda row: row["publishedAt"], reverse=True)[:5]


def build_snapshot(previous_snapshot=None):
    raw = get_json(LIST_URL)
    if not isinstance(raw, list):
        raise ValueError("NSE listing schema changed")
    issues = []
    for row in raw[:80]:
        issue = transform_issue(row)
        if issue:
            issues.append(issue)
    if raw and not issues:
        raise ValueError("NSE data present but none validates")
    errors = []
    now_time = datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")
    for issue in issues:
        issue["sourceObservedAt"] = now_time
        issue["sourceStale"] = False
    bse_coverage = "Unavailable: source did not respond"
    try:
        bse = recent_bse_sme()
        if not bse:
            raise ValueError("BSE SME table yielded no verifiable issues")
        for row in bse:
            row["sourceObservedAt"] = now_time
            row["sourceStale"] = False
        normalized = {re.sub(r"[^a-z0-9]", "", i["company"].lower()) for i in issues}
        for issue in bse:
            name = re.sub(r"[^a-z0-9]", "", issue["company"].lower())
            if name not in normalized:
                issues.append(issue)
                normalized.add(name)
        bse_coverage = "BSE SME website observed; " + str(len(bse)) + " recent issues"
    except (ValueError, urllib.error.URLError, TimeoutError) as error:
        errors.append("BSE SME: " + type(error).__name__)
        fallback = retained_sme(previous_snapshot)
        normalized = {re.sub(r"[^a-z0-9]", "", i["company"].lower()) for i in issues}
        for row in fallback:
            key = re.sub(r"[^a-z0-9]", "", row["company"].lower())
            if key not in normalized:
                issues.append(row)
                normalized.add(key)
        if fallback:
            bse_coverage = (
                "BSE unavailable; "
                + str(len(fallback))
                + " prior issues retained, explicitly stale"
            )

    for issue in issues:
        if issue["status"] != "OPEN" or issue["source"] != LIST_URL:
            continue
        try:
            enrich_detail(issue)
        except (ValueError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            errors.append(issue["id"] + ": " + type(error).__name__)
    add_unofficial_gmp(issues, errors)
    for issue in issues:
        if issue.get("sourceStale") or issue["status"] not in ("OPEN", "UPCOMING"):
            continue
        try:
            issue["news"] = recent_ipo_news(issue)
            issue["newsStatus"] = "Google News RSS · selected sources · verify originals"
        except (ValueError, urllib.error.URLError, TimeoutError, ElementTree.ParseError) as error:
            errors.append(issue["id"] + " news: " + type(error).__name__)
    return {
        "schemaVersion": 1,
        "generatedAt": now_time,
        "sourceName": "National Stock Exchange of India",
        "sourceURL": LIST_URL,
        "sourcePolicy": (
            "Public exchange website observations; timestamps indicate snapshot time, "
            "not guaranteed real-time licensed market data."
        ),
        "coverage": {"mainboard": "NSE observed", "sme": bse_coverage},
        "issues": issues,
        "warnings": errors[:20],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--accuracy-output", type=Path, default=DEFAULT_OUTPUT.with_name("ipo-accuracy.json")
    )
    args = parser.parse_args()
    try:
        try:
            previous = json.loads(args.output.read_text(encoding="utf8"))
        except (OSError, ValueError):
            previous = None
        snapshot = build_snapshot(previous_snapshot=previous)
    except Exception as error:
        print("IPO feed NOT updated:", type(error).__name__, str(error)[:200], file=sys.stderr)
        return 1
    args.output.parent.mkdir(parents=True, exist_ok=True)
    tmp = args.output.with_suffix(".tmp")
    tmp.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
    tmp.replace(args.output)
    try:
        accuracy = build_gmp_accuracy(get_json(ACCURACY_URL, timeout=11))
        acc_tmp = args.accuracy_output.with_suffix(".tmp")
        acc_tmp.write_text(
            json.dumps(accuracy, indent=2, ensure_ascii=False) + "\n", encoding="utf8"
        )
        acc_tmp.replace(args.accuracy_output)
    except (ValueError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        print(
            "IPO historical audit unavailable; existing verified copy preserved:",
            type(error).__name__,
            file=sys.stderr,
        )
    print(
        "Verified IPO snapshot:",
        len(snapshot["issues"]),
        "issues; "
        + str(len(snapshot["warnings"]))
        + " incomplete detail responses; "
        + snapshot["generatedAt"],
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
