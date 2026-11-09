#!/usr/bin/env python3
"""Verify private snapshot bytes, then inventory public archive metadata without prices."""

import argparse
import datetime as dt
import hashlib
import json
import pathlib
import re


def sessions():
    day = dt.date(2026, 9, 18)
    result = []
    while day <= dt.date(2026, 10, 16):
        if day.weekday() < 5 and day != dt.date(2026, 10, 2):
            result.append(day.isoformat())
        day += dt.timedelta(days=1)
    return result


def archive_inventory(tree):
    if tree.get("truncated") is not False or not re.fullmatch(r"[a-f0-9]{40}", tree.get("sha", "")):
        raise ValueError("COMPLETE_PINNED_TREE_REQUIRED")
    result = {"NSE": [], "NSE_IDX": []}
    seen = set()
    for entry in tree["tree"]:
        match = re.fullmatch(r"Minute/(NSE|NSE_IDX)/(\d{8})\.zip", entry["path"])
        if not match:
            continue
        stamp = match[2]
        date = dt.date(int(stamp[4:]), int(stamp[2:4]), int(stamp[:2])).isoformat()
        key = (match[1], date)
        if (
            key in seen
            or entry.get("type") != "blob"
            or not re.fullmatch(r"[a-f0-9]{40}", entry.get("sha", ""))
        ):
            raise ValueError("DUPLICATE_OR_INVALID_ARCHIVE_ENTRY")
        seen.add(key)
        result[match[1]].append(
            {
                "date": date,
                "path": entry["path"],
                "bytesInGitTree": entry.get("size"),
                "gitBlobSha1": entry["sha"],
                "downloadedArchiveSha256": None,
                "minuteRowsInspected": False,
            }
        )
    return {k: sorted(v, key=lambda row: row["date"]) for k, v in result.items()}


def verify_pinned_inventory(head, git_commit, tree, directory):
    commit = head.get("sha")
    expected_tree = head.get("commit", {}).get("tree", {}).get("sha")
    if (
        git_commit.get("sha") != commit
        or git_commit.get("tree", {}).get("sha") != expected_tree
        or tree.get("sha") != expected_tree
    ):
        raise ValueError("PINNED_COMMIT_TREE_IDENTITY_MISMATCH")
    inventory = archive_inventory(tree)
    expected = {r["path"]: (r["gitBlobSha1"], r["bytesInGitTree"]) for r in inventory["NSE"]}
    actual = {
        r["path"]: (r.get("sha"), r.get("size")) for r in directory if r.get("type") == "file"
    }
    if len(actual) != len(directory) or actual != expected:
        raise ValueError("PINNED_DIRECTORY_TREE_DISAGREEMENT")
    return inventory


def audit(snapshot_dir, receipt_files):
    base = pathlib.Path(snapshot_dir).resolve()
    records = {}
    for receipt_file in receipt_files:
        payload = json.loads(pathlib.Path(receipt_file).read_text())
        if payload["requested"] != payload["completed"]:
            raise ValueError("CAPTURE_PLAN_NOT_COMPLETE")
        for row in payload["receipts"]:
            if row["id"] in records:
                raise ValueError("DUPLICATE_SOURCE_RECEIPT")
            if "sha256" not in row:
                records[row["id"]] = row
                continue
            target = (base / (row["id"] + ".raw")).resolve()
            if target.parent != base:
                raise ValueError("UNSAFE_SNAPSHOT_PATH")
            raw = target.read_bytes()
            if len(raw) != row["bytes"] or hashlib.sha256(raw).hexdigest() != row["sha256"]:
                raise ValueError("SOURCE_SNAPSHOT_HASH_MISMATCH: " + row["id"])
            records[row["id"]] = row

    def data(name):
        if records[name].get("status") != 200:
            raise ValueError("SOURCE_METADATA_UNAVAILABLE: " + name)
        return json.loads((base / (name + ".raw")).read_text())

    alias_tree = data("gh-olo-minute-tree")
    tree = data("gh-olo-immutable-tree")
    head = data("gh-olo-minute-head")
    inventory = verify_pinned_inventory(
        head, data("gh-olo-git-commit"), tree, data("gh-olo-pinned-stock-directory")
    )
    requested = sessions()
    stock_dates = {r["date"]: r for r in inventory["NSE"]}
    index_dates = {r["date"]: r for r in inventory["NSE_IDX"]}
    release = data("gh-voletiramu-release")
    result = {
        "schema": "atlas.nse-source-findings.v1",
        "expectedSessions": requested,
        "sourceReceiptsVerified": len(records),
        "successfulHttpSnapshots": sum(r.get("status") == 200 for r in records.values()),
        "httpFailures": [
            {"id": r["id"], "status": r.get("status"), "error": r.get("error")}
            for r in records.values()
            if r.get("status") != 200
        ],
        "olo": {
            "repository": "https://github.com/olo-labs/olo-ai-training-data-nse-min-candle",
            "commit": head["sha"],
            "treeSha1": tree["sha"],
            "treeTruncated": tree["truncated"],
            "immutableCommitTreeAndDirectoryCrosscheck": "PASS",
            "aliasTreeResponseSha": alias_tree["sha"],
            "aliasTreeResponseIdentityMismatch": alias_tree["sha"] != tree["sha"],
            "stockArchives": len(inventory["NSE"]),
            "indexArchives": len(inventory["NSE_IDX"]),
            "firstStockDate": inventory["NSE"][0]["date"],
            "lastStockDate": inventory["NSE"][-1]["date"],
            "requestedStockArchiveNamesPresent": sum(d in stock_dates for d in requested),
            "daily": [
                {
                    "session": day,
                    "stockArchive": stock_dates.get(day),
                    "indexArchive": index_dates.get(day),
                    "certified": False,
                }
                for day in requested
            ],
            "decision": "QUARANTINED_METADATA_ONLY_UPSTREAM_RIGHTS_PIT_AND_BAR_CONTENT_UNVERIFIED",
            "readmeCoverageIsNotArchiveCoverage": True,
        },
        "voletiramu": {
            "commit": data("gh-voletiramu-head")["sha"],
            "release": release["tag_name"],
            "publishedAt": release["published_at"],
            "advertisedFrom": "2024-04-01",
            "advertisedThrough": "2026-04-30",
            "advertisedSymbols": 214,
            "assets": [
                {
                    "name": x["name"],
                    "bytes": x["size"],
                    "publisherMetadataDigest": x.get("digest"),
                    "downloadedArchiveSha256": None,
                }
                for x in release.get("assets", [])
            ],
            "decision": "OUTSIDE_REQUESTED_WINDOW_RESTRICTED_RETROSPECTIVE_UNIVERSE",
        },
        "gsidhu": {
            "commit": data("gh-gsidhu-head")["sha"],
            "rootYears": [
                x["name"]
                for x in data("gh-gsidhu-pinned-root")
                if re.fullmatch(r"\d{4}", x["name"])
            ],
            "decision": "NO_REQUESTED_WINDOW_EQUITY_ARCHIVE_VERIFIED",
        },
        "djjain": {
            "commit": data("gh-djjain-head")["sha"],
            "advertisedSegment": "DERIVATIVES_NOT_CASH_EQUITIES",
            "advertisedThrough": "2026-06",
            "decision": "PURCHASE_INQUIRY_AND_OUTSIDE_WINDOW_NOT_A_FREE_CASH_DATASET",
        },
        "huggingFace": {
            "url": records["hf-dataset-metadata"]["url"],
            "observedStatus": records["hf-dataset-metadata"].get("status"),
            "decision": "UNAVAILABLE_WITHOUT_AUTH_NO_LOGIN_ATTEMPTED",
        },
        "rawMarketArchivesDownloaded": 0,
        "realSessionsCertified": 0,
        "historicalNetPnlINR": None,
        "historicalReturnPct": None,
        "note": (
            "Git blob SHA-1 and publisher-reported digests are metadata, "
            "not locally verified archive SHA-256 hashes."
        ),
    }
    encoded = json.dumps(result, sort_keys=True, separators=(",", ":")).encode()
    result["findingsSha256"] = hashlib.sha256(encoded).hexdigest()
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--private-dir", required=True)
    parser.add_argument("--receipts", action="append", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    result = audit(args.private_dir, args.receipts)
    with pathlib.Path(args.output).open("x") as stream:
        json.dump(result, stream, indent=2)
        stream.write("\n")
    print(
        json.dumps(
            {
                k: result[k]
                for k in ["sourceReceiptsVerified", "realSessionsCertified", "findingsSha256"]
            }
        )
    )


if __name__ == "__main__":
    main()
