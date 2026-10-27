"""Publisher branch isolation and uncertain-push recovery tests; no network is used."""

import importlib.util
import json
import subprocess
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
                with patch.object(
                    publisher,
                    "git",
                    return_value=(
                        "AGENTS.md\n.ai/HANDOFF.md\n.ai/AGENT_HANDOFF.json\n"
                        ".ai/OBJECTIVE_ENVELOPE.json\n.ai/SURFACE_HANDOFF.json"
                    ),
                ):
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
                patch.object(
                    publisher,
                    "snapshots",
                    return_value={
                        "frontend/public/runtime-publication.json": json.dumps(
                            {"sha256": {"paper": "digest", "ipo": "digest"}}
                        )
                    },
                ),
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
                        "sha256": {"paper": "digest", "ipo": "digest"},
                    }
                )
            )
            with (
                patch.object(publisher, "remote_head", return_value="a" * 40),
                patch.object(
                    publisher,
                    "snapshots",
                    return_value={
                        "frontend/public/runtime-publication.json": json.dumps(
                            {"sha256": {"paper": "digest", "ipo": "digest"}}
                        )
                    },
                ),
                patch.object(publisher, "git") as git,
            ):
                result = publisher.publish("c" * 40)
            self.assertEqual(result["status"], "already_current")
            git.assert_not_called()

    def test_new_candle_is_checked_after_settlement_not_at_the_old_phase(self):
        previous = {"lastRunAt": "2026-10-25T05:58:00Z", "status": "DEGRADED"}
        for hour, minute in [(5, 58), (6, 4), (7, 30), (7, 58)]:
            with self.subTest(hour=hour, minute=minute):
                self.assertIsNone(
                    publisher.checkpoint_plan(
                        previous, {}, datetime(2026, 10, 25, hour, minute, tzinfo=UTC)
                    )
                )
        plan = publisher.checkpoint_plan(previous, {}, datetime(2026, 10, 25, 6, 5, tzinfo=UTC))
        self.assertEqual(plan["windowClosedAt"], "2026-10-25T06:00:00+00:00")
        self.assertEqual(plan["attempts"], 1)

    def test_source_retries_are_spaced_and_bounded_without_relaxing_source_age(self):
        previous = {"lastRunAt": "2026-10-25T06:05:00Z", "status": "DEGRADED"}
        schedule = {
            "windowClosedAt": "2026-10-25T06:00:00+00:00",
            "attempts": 1,
            "lastAttemptAt": "2026-10-25T06:05:00+00:00",
        }
        self.assertIsNone(
            publisher.checkpoint_plan(previous, schedule, datetime(2026, 10, 25, 6, 9, tzinfo=UTC))
        )
        second = publisher.checkpoint_plan(
            previous, schedule, datetime(2026, 10, 25, 6, 10, tzinfo=UTC)
        )
        self.assertEqual(second["attempts"], 2)
        self.assertIsNone(
            publisher.checkpoint_plan(
                previous, {**second, "attempts": 3}, datetime(2026, 10, 25, 6, 20, tzinfo=UTC)
            )
        )

    def test_successful_window_is_not_repeated_and_a_later_window_can_run(self):
        previous = {"lastRunAt": "2026-10-25T06:05:10Z", "status": "RUNNING"}
        self.assertIsNone(
            publisher.checkpoint_plan(previous, {}, datetime(2026, 10, 25, 6, 10, tzinfo=UTC))
        )
        self.assertIsNotNone(
            publisher.checkpoint_plan(previous, {}, datetime(2026, 10, 25, 8, 5, tzinfo=UTC))
        )

    def test_active_publisher_refreshes_ipo_without_running_retired_paper(self):
        with tempfile.TemporaryDirectory() as folder:
            state = Path(folder)
            published = state / "published"
            published.mkdir()
            (published / "cloud-paper.json").write_text(
                json.dumps({"lastRunAt": "2026-10-25T06:05:10Z"})
            )
            with (
                patch.object(publisher, "STATE", state),
                patch.object(publisher, "PUBLISHED", published),
                patch.object(publisher, "prepare_state"),
                patch.object(publisher, "assert_approved_code", return_value="a" * 40),
                patch.object(publisher, "checkpoint_plan") as plan,
                patch.object(publisher, "run", return_value="updated") as run,
                patch.object(publisher, "validate_artifacts"),
                patch.object(publisher, "publish", return_value={"status": "published"}),
            ):
                publisher.cycle()
            plan.assert_not_called()
            run.assert_called_once_with(
                [publisher.PYTHON, str(publisher.ROOT / "scripts/update_permitted_ipo.py")],
                timeout=45,
            )

    def test_publisher_waits_for_launchd_to_release_the_previous_service(self):
        with (
            patch.object(
                publisher.subprocess,
                "run",
                side_effect=[
                    subprocess.CompletedProcess([], 0),
                    subprocess.CompletedProcess([], 113),
                ],
            ) as run,
            patch.object(publisher.time, "sleep") as pause,
        ):
            publisher.wait_for_service_removal("gui/501", publisher.LABEL)
        self.assertEqual(run.call_count, 2)
        pause.assert_called_once_with(0.1)

    def test_stuck_previous_publisher_is_a_bounded_failure(self):
        with (
            patch.object(
                publisher.subprocess, "run", return_value=subprocess.CompletedProcess([], 0)
            ) as run,
            patch.object(publisher.time, "sleep"),
            self.assertRaisesRegex(RuntimeError, "still stopping"),
        ):
            publisher.wait_for_service_removal("gui/501", publisher.LABEL)
        self.assertEqual(run.call_count, 50)
