"""Publisher branch isolation and uncertain-push recovery tests; no network is used."""

import importlib.util
import json
import sys
import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import patch

MODULE = Path(__file__).resolve().parents[2] / "scripts/public_report_publisher.py"
spec = importlib.util.spec_from_file_location("public_report_publisher", MODULE)
publisher = importlib.util.module_from_spec(spec)
with patch.object(sys, "path", [str(MODULE.parent), *sys.path]):
    spec.loader.exec_module(publisher)


class PublicReportPublisherTests(unittest.TestCase):
    def test_only_public_research_files_can_enter_the_data_branch(self):
        self.assertEqual(publisher.REF, "refs/heads/data/atlas-runtime")
        self.assertEqual(len(publisher.PATHS), 5)
        self.assertFalse(
            any("sqlite" in p or "push" in p or ".github" in p for p in publisher.PATHS)
        )
        self.assertNotIn("frontend/src/App.tsx", publisher.PATHS)

    def test_runtime_code_requires_an_exact_verified_head_and_clean_application_tree(self):
        with (
            tempfile.TemporaryDirectory() as folder,
            patch.object(publisher, "STATE", Path(folder)),
        ):
            Path(folder, "publisher-approval.json").write_text(
                json.dumps({"codeSha": "a" * 40, "branch": publisher.BRANCH})
            )
            with (
                patch.object(publisher, "code_head", return_value="b" * 40),
                self.assertRaises(ValueError),
            ):
                publisher.assert_approved_code()
            with patch.object(publisher, "code_head", return_value="a" * 40):
                with (
                    patch.object(publisher, "git", return_value="frontend/server.js"),
                    self.assertRaises(ValueError),
                ):
                    publisher.assert_approved_code()
                with patch.object(publisher, "git", return_value="AGENTS.md\n.ai/HANDOFF.md"):
                    self.assertEqual(publisher.assert_approved_code(), "a" * 40)

    def test_unknown_push_that_reached_origin_is_reconciled_without_replay(self):
        with (
            tempfile.TemporaryDirectory() as folder,
            patch.object(publisher, "STATE", Path(folder)),
        ):
            path = Path(folder, "publisher-journal.json")
            path.write_text(
                json.dumps({"status": "push_attempted", "candidate": "a" * 40, "parent": "b" * 40})
            )
            with (
                patch.object(publisher, "remote_head", return_value="a" * 40),
                patch.object(publisher, "git") as git,
            ):
                result = publisher.publish("c" * 40)
            self.assertEqual(result["status"], "published_reconciled")
            git.assert_not_called()
            self.assertEqual(json.loads(path.read_text())["status"], "published")

    def test_unknown_push_retries_the_same_candidate_only_when_parent_is_proven(self):
        with (
            tempfile.TemporaryDirectory() as folder,
            patch.object(publisher, "STATE", Path(folder)),
        ):
            path = Path(folder, "publisher-journal.json")
            path.write_text(
                json.dumps({"status": "push_attempted", "candidate": "a" * 40, "parent": "b" * 40})
            )
            with (
                patch.object(publisher, "remote_head", side_effect=["b" * 40, "a" * 40]),
                patch.object(publisher, "git") as git,
            ):
                publisher.publish("c" * 40)
            git.assert_called_once_with(
                "push", "origin", "a" * 40 + ":" + publisher.REF, timeout=40
            )

    def test_divergent_uncertain_push_stops_before_any_new_commit_or_push(self):
        with (
            tempfile.TemporaryDirectory() as folder,
            patch.object(publisher, "STATE", Path(folder)),
        ):
            Path(folder, "publisher-journal.json").write_text(
                json.dumps({"status": "push_attempted", "candidate": "a" * 40, "parent": "b" * 40})
            )
            with (
                patch.object(publisher, "remote_head", return_value="d" * 40),
                patch.object(publisher, "git") as git,
            ):
                with self.assertRaises(ValueError):
                    publisher.publish("c" * 40)
            git.assert_not_called()

    def test_application_code_on_the_remote_data_branch_is_never_overwritten(self):
        with patch.object(publisher, "git", side_effect=["", "a" * 40, "frontend/src/App.tsx"]):
            with self.assertRaises(ValueError):
                publisher.check_existing_branch("a" * 40)

    def test_restart_does_not_create_duplicate_publications(self):
        with (
            tempfile.TemporaryDirectory() as folder,
            patch.object(publisher, "STATE", Path(folder)),
        ):
            Path(folder, "publisher-journal.json").write_text(
                json.dumps(
                    {
                        "status": "published",
                        "candidate": "a" * 40,
                        "codeSha": "c" * 40,
                        "publishedAt": datetime.now(UTC).isoformat(),
                    }
                )
            )
            with (
                patch.object(publisher, "remote_head", return_value="a" * 40),
                patch.object(publisher, "git") as git,
            ):
                result = publisher.publish("c" * 40)
            self.assertEqual(result["status"], "already_current")
            git.assert_not_called()
