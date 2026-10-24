"""All archives below are explicit, artificial engineering fixtures; no market performance."""

import hashlib
import importlib.util
import io
import json
import pathlib
import tempfile
import unittest
import zipfile
from unittest.mock import Mock, patch

ROOT = pathlib.Path(__file__).resolve().parents[2]


def module(name):
    spec = importlib.util.spec_from_file_location(
        name, ROOT / "research" / "nse-certification" / (name + ".py")
    )
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


capture = module("capture")
audit_sources = module("audit_sources")
inspector = module("inspect_archive")


class PublicCaptureTests(unittest.TestCase):
    def test_only_public_read_sources(self):
        self.assertEqual(
            capture.public_url("https://api.github.com/repos/a/b"),
            "https://api.github.com/repos/a/b",
        )
        for url in [
            "http://upstox.com/",
            "https://u:p@upstox.com/",
            "https://127.0.0.1/",
            "https://upstox.com/orders",
            "https://upstox.com/%6frders",
            "https://upstox.com/oauth/token",
            "https://upstox.com/login",
            "https://upstox.com/?token=x",
            "https://upstox.com:8443/",
            "https://evil.example/",
            "https://upstox.com/#secret",
        ]:
            with self.subTest(url=url), self.assertRaises(ValueError):
                capture.public_url(url)

    def test_market_archives_and_nse_website_data_api_are_not_acquisition_routes(self):
        for url in [
            "https://www.nseindia.com/api/quote-equity?symbol=TEST",
            "https://raw.githubusercontent.com/a/b/main/prices.csv",
            "https://raw.githubusercontent.com/a/b/main/18092026.zip",
            "https://assets.upstox.com/prices.json.gz",
            "https://api.github.com/repos/a/b/git/blobs/abc",
            "https://upstox.com/%256frders",
        ]:
            with self.subTest(url=url), self.assertRaises(ValueError):
                capture.public_url(url)

    def test_redirect_cannot_escape_allowlist(self):
        handler = capture.PublicRedirects()
        with self.assertRaises(ValueError):
            handler.redirect_request(None, None, 302, "", {}, "https://evil.example/")

    def test_invalid_source_id_never_issues_request(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                capture.capture("https://upstox.com/", directory, "../../escape")
            self.assertEqual(list(pathlib.Path(directory).iterdir()), [])

    def test_get_is_unauthenticated_size_limited_and_does_not_overwrite(self):
        class Response(io.BytesIO):
            code = 200
            url = "https://upstox.com/trading-api/"

            def __init__(self, raw):
                super().__init__(raw)
                self.headers = {"Content-Type": "text/plain", "Set-Cookie": "never-log-this"}

        opener = Mock()
        opener.open.return_value = Response(b"public document")
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(capture.urllib.request, "build_opener", return_value=opener),
        ):
            result = capture.capture(Response.url, directory, "document")
            self.assertEqual(result["sha256"], hashlib.sha256(b"public document").hexdigest())
            self.assertNotIn("Set-Cookie", result["headers"])
            request = opener.open.call_args.args[0]
            self.assertEqual(request.get_method(), "GET")
            self.assertFalse(any(k.lower() in ["cookie", "authorization"] for k in request.headers))
            with self.assertRaises(FileExistsError):
                capture.capture(Response.url, directory, "document")
            self.assertEqual(opener.open.call_count, 1)
        opener.open.return_value = Response(b"x" * (capture.MAX_BYTES + 1))
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(capture.urllib.request, "build_opener", return_value=opener),
        ):
            result = capture.capture(Response.url, directory, "oversized")
            self.assertIn("RESPONSE_TOO_LARGE", result["error"])
            self.assertEqual(list(pathlib.Path(directory).iterdir()), [])

    def test_429_stops_and_journals_partial_plan_without_retry(self):
        with tempfile.TemporaryDirectory() as directory:
            p = pathlib.Path(directory)
            plan = [
                {"id": "a", "url": "https://upstox.com/a"},
                {"id": "b", "url": "https://upstox.com/b"},
            ]
            (p / "plan.json").write_text(json.dumps(plan))
            argv = [
                "capture.py",
                "--plan",
                str(p / "plan.json"),
                "--private-dir",
                str(p / "raw"),
                "--receipts",
                str(p / "receipts.json"),
            ]
            with (
                patch("sys.argv", argv),
                patch.object(capture, "capture", return_value={"id": "a", "status": 429}) as get,
                patch.object(capture.time, "sleep") as sleep,
                patch("sys.stdout", io.StringIO()),
            ):
                capture.main()
            self.assertEqual(get.call_count, 1)
            sleep.assert_not_called()
            result = json.loads((p / "receipts.json").read_text())
            self.assertEqual((result["requested"], result["completed"]), (2, 1))
            self.assertEqual(len((p / "receipts.json.journal.jsonl").read_text().splitlines()), 1)
            self.assertRegex(result["captureScriptSha256"], r"^[a-f0-9]{64}$")

    def test_entire_plan_validates_before_network(self):
        with tempfile.TemporaryDirectory() as directory:
            p = pathlib.Path(directory)
            (p / "plan.json").write_text(
                json.dumps(
                    [
                        {"id": "valid", "url": "https://upstox.com/"},
                        {"id": "../invalid", "url": "https://upstox.com/"},
                    ]
                )
            )
            argv = [
                "capture.py",
                "--plan",
                str(p / "plan.json"),
                "--private-dir",
                str(p / "raw"),
                "--receipts",
                str(p / "receipts.json"),
            ]
            with (
                patch("sys.argv", argv),
                patch.object(capture, "capture") as get,
                self.assertRaises(ValueError),
            ):
                capture.main()
            get.assert_not_called()


class MetadataAuditTests(unittest.TestCase):
    def tree(self):
        return {
            "sha": "a" * 40,
            "truncated": False,
            "tree": [
                {"path": "Minute/NSE/18092026.zip", "type": "blob", "sha": "b" * 40, "size": 123},
                {
                    "path": "Minute/NSE_IDX/18092026.zip",
                    "type": "blob",
                    "sha": "c" * 40,
                    "size": 100,
                },
            ],
        }

    def test_metadata_presence_never_becomes_verified_minute_content(self):
        inventory = audit_sources.archive_inventory(self.tree())
        row = inventory["NSE"][0]
        self.assertEqual(row["date"], "2026-09-18")
        self.assertIsNone(row["downloadedArchiveSha256"])
        self.assertFalse(row["minuteRowsInspected"])
        self.assertEqual(len(audit_sources.sessions()), 20)

    def test_truncated_duplicate_invalid_date_and_invalid_blob_fail(self):
        for kind in ["truncated", "duplicate", "date", "sha"]:
            tree = self.tree()
            if kind == "truncated":
                tree["truncated"] = True
            elif kind == "duplicate":
                tree["tree"].append(tree["tree"][0])
            elif kind == "date":
                tree["tree"][0]["path"] = "Minute/NSE/31022026.zip"
            else:
                tree["tree"][0]["sha"] = "not-a-hash"
            with self.subTest(kind=kind), self.assertRaises(ValueError):
                audit_sources.archive_inventory(tree)

    def test_snapshot_byte_mutation_fails_before_any_metadata_is_used(self):
        with tempfile.TemporaryDirectory() as directory:
            p = pathlib.Path(directory)
            (p / "sample.raw").write_bytes(b"tampered")
            receipt = {
                "requested": 1,
                "completed": 1,
                "receipts": [
                    {
                        "id": "sample",
                        "status": 200,
                        "bytes": 2,
                        "sha256": hashlib.sha256(b"{}").hexdigest(),
                    }
                ],
            }
            (p / "receipts.json").write_text(json.dumps(receipt))
            with self.assertRaisesRegex(ValueError, "HASH_MISMATCH"):
                audit_sources.audit(p, [p / "receipts.json"])

    def test_commit_tree_and_pinned_contents_must_agree(self):
        tree = self.tree()
        head = {"sha": "f" * 40, "commit": {"tree": {"sha": tree["sha"]}}}
        git_commit = {"sha": head["sha"], "tree": {"sha": tree["sha"]}}
        directory = [
            {"path": tree["tree"][0]["path"], "sha": "b" * 40, "size": 123, "type": "file"}
        ]
        self.assertEqual(
            len(audit_sources.verify_pinned_inventory(head, git_commit, tree, directory)["NSE"]), 1
        )
        tree["sha"] = head["sha"]
        with self.assertRaisesRegex(ValueError, "IDENTITY_MISMATCH"):
            audit_sources.verify_pinned_inventory(head, git_commit, tree, directory)
        tree["sha"] = "a" * 40
        directory[0]["sha"] = "d" * 40
        with self.assertRaisesRegex(ValueError, "DISAGREEMENT"):
            audit_sources.verify_pinned_inventory(head, git_commit, tree, directory)


class ArchiveInspectionTests(unittest.TestCase):
    def archive(self, directory, name="fixture.csv", row=None):
        p = pathlib.Path(directory) / "fixture.zip"
        content = (
            ",".join(inspector.HEADER)
            + "\n"
            + (row or "FIXTURE.NSE,18/09/2026,09:15:59,100,101,99,100,0,0")
            + "\n"
        )
        with zipfile.ZipFile(p, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(name, content)
        return p

    def test_exact_archive_and_member_hashes_timestamp_semantics_remain_unverified(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.archive(directory)
            report = inspector.inspect(path)
            self.assertEqual(report["archiveSha256"], hashlib.sha256(path.read_bytes()).hexdigest())
            self.assertEqual(report["members"][0]["timestampSecondHistogram"], {"59": 1})
            self.assertEqual(report["members"][0]["observedZeroVolumeRows"], 1)
            self.assertEqual(report["timezone"], "UNVERIFIED")
            self.assertFalse(report["certified"])
            self.assertFalse(report["observationsModified"])
            self.assertEqual(
                sorted(x.name for x in pathlib.Path(directory).iterdir()), ["fixture.zip"]
            )

    def test_zip_traversal_absolute_backslash_and_non_csv_rejected(self):
        for name in ["../escape.csv", "/absolute.csv", "a\\escape.csv", "payload.exe"]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                with self.assertRaises(ValueError):
                    inspector.inspect(self.archive(directory, name))

    def test_duplicate_members_and_high_expansion_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "fixture.zip"
            with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("bomb.csv", b"0" * 1000000)
            with self.assertRaisesRegex(ValueError, "EXPANSION"):
                inspector.inspect(path)
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("same.csv", "a")
                archive.writestr("same.csv", "b")
            with self.assertRaisesRegex(ValueError, "DUPLICATE"):
                inspector.inspect(path)

    def test_bad_ohlc_nonfinite_and_fractional_volume_rejected(self):
        for row in [
            "FIXTURE.NSE,18/09/2026,09:15:00,100,99,101,100,1,0",
            "FIXTURE.NSE,18/09/2026,09:15:00,NaN,101,99,100,1,0",
            "FIXTURE.NSE,18/09/2026,09:15:00,100,101,99,100,0.5,0",
            "FIXTURE.NSE,18/09/2026,09:15:00,100,101,99,100,-1,0",
        ]:
            with self.subTest(row=row), tempfile.TemporaryDirectory() as directory:
                with self.assertRaises(ValueError):
                    inspector.inspect(self.archive(directory, row=row))

    def test_bad_crc_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "fixture.zip"
            with zipfile.ZipFile(path, "w", zipfile.ZIP_STORED) as archive:
                archive.writestr(
                    "fixture.csv",
                    ",".join(inspector.HEADER)
                    + "\nFIXTURE.NSE,18/09/2026,09:15:00,100,101,99,100,1,0\n",
                )
            raw = path.read_bytes().replace(b"FIXTURE.NSE", b"BROKENX.NSE", 1)
            path.write_bytes(raw)
            with self.assertRaises(zipfile.BadZipFile):
                inspector.inspect(path)


if __name__ == "__main__":
    unittest.main()
