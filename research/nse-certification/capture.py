#!/usr/bin/env python3
"""Bounded, unauthenticated public-source research. Never fetches trading endpoints.

Snapshots stay outside Git. Receipts contain hashes, not market observations or cookies.
"""

import argparse
import datetime as dt
import hashlib
import json
import os
import pathlib
import re
import time
import urllib.error
import urllib.parse
import urllib.request

MAX_BYTES = 4 * 1024 * 1024
HOSTS = frozenset(
    {
        "www.nseindia.com",
        "nsearchives.nseindia.com",
        "archives.nseindia.com",
        "upstox.com",
        "community.upstox.com",
        "assets.upstox.com",
        "fyers.in",
        "support.fyers.in",
        "shoonya.com",
        "flattrade.in",
        "faq.flattrade.in",
        "pi.flattrade.in",
        "groww.in",
        "dhanhq.co",
        "zerodha.com",
        "kite.trade",
        "smartapi.angelbroking.com",
        "smartapi.angelone.in",
        "www.sebi.gov.in",
        "api.github.com",
        "raw.githubusercontent.com",
        "huggingface.co",
        "query1.finance.yahoo.com",
        "legal.yahoo.com",
    }
)


def public_url(url):
    p = urllib.parse.urlsplit(url)
    path = urllib.parse.unquote(p.path)
    # This collector inspects documents/metadata only. Market archives and NSE
    # website APIs require a separately permitted data route, never a scrape.
    if (
        "%" in path
        or (p.hostname == "www.nseindia.com" and path.startswith("/api/"))
        or (
            re.search(r"(?i)\.(zip|gz|parquet|csv)$", path)
            and path
            not in {"/content/equities/namechange.csv", "/content/equities/symbolchange.csv"}
        )
        or (
            p.hostname == "raw.githubusercontent.com"
            and not path.lower().endswith((".md", ".py", ".js", ".mjs", "/license"))
        )
        or (p.hostname == "api.github.com" and "/git/blobs/" in path)
    ):
        raise ValueError("DOCUMENT_OR_REFERENCE_METADATA_ONLY")
    if (
        p.scheme != "https"
        or p.hostname not in HOSTS
        or p.username
        or p.password
        or p.port not in (None, 443)
        or p.fragment
        or re.search(r"(?i)(token|secret|auth|password|session|key)=", p.query)
        or re.search(
            r"(?i)(/orders?(?:/|$)|/login(?:/|$)|/oauth(?:/|$)|placeorder|cancelorder|modifyorder|payout)",
            path,
        )
    ):
        raise ValueError("PUBLIC_RESEARCH_URL_REQUIRED")
    return url


class PublicRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        public_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def capture(url, directory, source_id):
    """One GET; no auth, cookies, retries, proxies supplied by caller, or block evasion."""
    public_url(url)
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,90}", source_id):
        raise ValueError("INVALID_SOURCE_ID")
    out = pathlib.Path(directory)
    out.mkdir(parents=True, exist_ok=True)
    target = out / (source_id + ".raw")
    if target.exists():
        raise FileExistsError("SNAPSHOT_ALREADY_EXISTS")
    receipt = {
        "id": source_id,
        "url": url,
        "requested_at": dt.datetime.now(dt.UTC).isoformat(),
        "authentication": "NONE",
        "method": "GET",
    }
    opener = urllib.request.build_opener(PublicRedirects())
    try:
        # public_url enforces HTTPS, exact allowed hosts and no credentials; redirects revalidate.
        request = urllib.request.Request(  # noqa: S310
            url, headers={"User-Agent": "Atlas-NSE-source-research/1.0", "Accept": "*/*"}
        )
        try:
            response = opener.open(request, timeout=18)
        except urllib.error.HTTPError as exc:
            response = exc
        with response:
            raw = response.read(MAX_BYTES + 1)
            if len(raw) > MAX_BYTES:
                raise ValueError("RESPONSE_TOO_LARGE_NOT_ARCHIVED")
            receipt.update(
                {
                    "status": response.code,
                    "final_url": public_url(response.url),
                    "bytes": len(raw),
                    "sha256": hashlib.sha256(raw).hexdigest(),
                    "headers": {
                        k.lower(): v
                        for k, v in response.headers.items()
                        if k.lower() in {"content-type", "last-modified", "etag", "date"}
                    },
                }
            )
            with target.open("xb") as stream:
                stream.write(raw)
    except (OSError, ValueError) as exc:
        receipt["error"] = type(exc).__name__ + ": " + str(exc)[:240]
    receipt["retrieved_at"] = dt.datetime.now(dt.UTC).isoformat()
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", required=True)
    parser.add_argument("--private-dir", required=True)
    parser.add_argument("--receipts", required=True)
    args = parser.parse_args()
    script_hash = hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()
    plan = json.loads(pathlib.Path(args.plan).read_text())
    if not isinstance(plan, list) or not 1 <= len(plan) <= 60:
        raise ValueError("BOUNDED_EXPLICIT_PLAN_REQUIRED")
    ids = [row["id"] for row in plan]
    if len(ids) != len(set(ids)):
        raise ValueError("DUPLICATE_SOURCE_ID")
    # Validate everything before issuing any request; never overwrite snapshots.
    for row in plan:
        public_url(row["url"])
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,90}", row["id"]):
            raise ValueError("INVALID_SOURCE_ID")
        if (pathlib.Path(args.private_dir) / (row["id"] + ".raw")).exists():
            raise FileExistsError(row["id"])
    output = pathlib.Path(args.receipts)
    if output.exists():
        raise FileExistsError("RECEIPTS_ALREADY_EXIST")
    receipts = []
    # A journal survives interruption; partial captures cannot silently become a complete audit.
    with pathlib.Path(str(output) + ".journal.jsonl").open("x") as journal:
        for row in plan:
            record = capture(row["url"], args.private_dir, row["id"])
            receipts.append(record)
            journal.write(json.dumps(record) + "\n")
            journal.flush()
            os.fsync(journal.fileno())
            print(
                json.dumps(
                    {k: record.get(k) for k in ["id", "status", "bytes", "sha256", "error"]}
                ),
                flush=True,
            )
            if record.get("status") == 429:
                break
            time.sleep(1)  # Deliberately far below public-provider limits.
    with pathlib.Path(args.receipts).open("x") as stream:
        json.dump(
            {
                "schema": "atlas.nse-source-receipts.v1",
                "receipts": receipts,
                "requested": len(plan),
                "completed": len(receipts),
                "captureScriptSha256": script_hash,
            },
            stream,
            indent=2,
        )
        stream.write("\n")


if __name__ == "__main__":
    main()
