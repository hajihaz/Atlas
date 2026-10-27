#!/usr/bin/env python3
"""Publish bounded public research JSON from the owner Mac, without hosted CI minutes.

The fixed orphan data branch contains no workflows or executable application code.
This neither releases main nor creates/bypasses CI statuses. The preview alone reads it.
"""

from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
import plistlib
import signal
import subprocess
import tempfile
import threading
import time
from datetime import UTC, datetime
from pathlib import Path

from update_permitted_ipo import atomic

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / ".atlas-runtime"
PUBLISHED = STATE / "published"
BRANCH = "data/atlas-runtime"
REF = "refs/heads/" + BRANCH
NODE = "/opt/homebrew/opt/node@24/bin/node"
PYTHON = str(ROOT / ".venv/bin/python")
LABEL = "com.hajihaz.atlas.ipo-publisher"
PATHS = frozenset(
    {
        "frontend/public/cloud-paper.json",
        "frontend/public/ipo-feed.json",
        "frontend/public/runtime-publication.json",
        "frontend/vercel.json",
        "vercel.json",
    }
)
ENV = {
    "PATH": "/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:/usr/bin:/bin",
    "HOME": str(Path.home()),
    "GIT_TERMINAL_PROMPT": "0",
    "LC_ALL": "en_US.UTF-8",
}
STOP = threading.Event()


def run(argv, *, data=None, env=None, timeout=30):
    result = subprocess.run(  # noqa: S603 - fixed argument arrays; never a shell
        argv,
        cwd=ROOT,
        input=data,
        text=True,
        capture_output=True,
        timeout=timeout,
        env={**ENV, **(env or {})},
        check=False,
    )
    if result.returncode:
        # Public worker output only; no environment or credential dumps.
        raise RuntimeError("Command failed: " + argv[0] + " (" + str(result.returncode) + ")")
    return result.stdout.strip()


def git(*args, **kwargs):
    return run(["/usr/bin/git", *args], **kwargs)


def prepare_state():
    for folder in (STATE, PUBLISHED):
        folder.mkdir(mode=0o700, exist_ok=True)
        if folder.is_symlink():
            raise ValueError("Unsafe publisher directory")
        folder.chmod(0o700)


def code_head():
    return git("rev-parse", "HEAD")


def assert_approved_code():
    path = STATE / "publisher-approval.json"
    if path.is_symlink():
        raise ValueError("Unsafe publisher approval")
    approval = json.loads(path.read_text())
    head = code_head()
    if approval.get("codeSha") != head or approval.get("branch") != BRANCH:
        raise ValueError("Publisher code changed; exact-head verification required")
    dirty = git("diff", "--name-only", head).splitlines()
    if set(dirty) - {
        "AGENTS.md",
        ".ai/HANDOFF.md",
        ".ai/AGENT_HANDOFF.json",
        ".ai/OBJECTIVE_ENVELOPE.json",
        ".ai/SURFACE_HANDOFF.json",
    }:
        raise ValueError("Tracked application changes require verification before publication")
    return head


def remote_head():
    output = git("ls-remote", "--heads", "origin", REF)
    rows = output.splitlines()
    if not rows:
        return None
    if len(rows) != 1 or rows[0].split()[1] != REF:
        raise ValueError("Ambiguous report branch")
    return rows[0].split()[0]


def validate_artifacts():
    # These are the same validators used by the preview endpoints.
    js = """
import {readFile} from 'node:fs/promises';
import {validatePrivateCloudSnapshot} from './frontend/api/cloud-paper.js';
import {validatePublisherIpoSnapshot} from './frontend/src/lib/publisherIpoValidation.js';
for(const [path,validate] of [
 ['.atlas-runtime/published/cloud-paper.json',validatePrivateCloudSnapshot],
 ['.atlas-runtime/ipo-feed.json',validatePublisherIpoSnapshot]]){
 const bytes=await readFile(path);if(bytes.length>500000)throw Error('Snapshot too large');
 validate(JSON.parse(bytes));
}
"""
    run([NODE, "--input-type=module", "-e", js], timeout=15)


def snapshots(code_sha):
    files = {
        "frontend/public/cloud-paper.json": (PUBLISHED / "cloud-paper.json").read_text(),
        "frontend/public/ipo-feed.json": (STATE / "ipo-feed.json").read_text(),
    }
    # Never copy the ledger, subscriptions, source code, environment or private receipts.
    paper = json.loads(files["frontend/public/cloud-paper.json"])
    ipo = json.loads(files["frontend/public/ipo-feed.json"])
    manifest = {
        "schema": "atlas.public-research-publication.v1",
        "codeSha": code_sha,
        "generatedAt": datetime.now(UTC).isoformat(),
        "mode": "PREVIEW_RESEARCH_ONLY",
        "actualCapitalINR": 0,
        "realOrdersEnabled": False,
        "sourceClocks": {"paper": paper["lastRunAt"], "ipo": ipo["generatedAt"]},
        "sha256": {name: hashlib.sha256(raw.encode()).hexdigest() for name, raw in files.items()},
    }
    files["frontend/public/runtime-publication.json"] = (
        json.dumps(manifest, separators=(",", ":")) + "\n"
    )
    # Both possible Vercel config roots disable this data branch completely.
    config = json.dumps({"git": {"deploymentEnabled": False}}) + "\n"
    files.update({"frontend/vercel.json": config, "vercel.json": config})
    if set(files) != PATHS:
        raise ValueError("Unexpected publication files")
    return files


def check_existing_branch(sha):
    git("fetch", "--no-tags", "origin", REF + ":refs/remotes/origin/" + BRANCH)
    if git("rev-parse", "refs/remotes/origin/" + BRANCH) != sha:
        raise ValueError("Report branch changed during reconciliation")
    paths = set(git("ls-tree", "-r", "--name-only", sha).splitlines())
    if paths != PATHS:
        raise ValueError("Report branch contains unexpected files; refusing to overwrite")
    manifest = json.loads(git("show", sha + ":frontend/public/runtime-publication.json"))
    if manifest.get("schema") != "atlas.public-research-publication.v1":
        raise ValueError("Existing data branch is not this publisher")


def create_commit(files, parent):
    fd, index = tempfile.mkstemp(prefix="publisher-index-", dir=STATE)
    os.close(fd)
    Path(index).unlink()
    env = {"GIT_INDEX_FILE": index}
    try:
        git("read-tree", "--empty", env=env)
        for name, raw in sorted(files.items()):
            if name not in PATHS or len(raw.encode()) > 500_000:
                raise ValueError("Unexpected publication artifact")
            blob = git("hash-object", "-w", "--stdin", data=raw)
            git("update-index", "--add", "--cacheinfo", "100644," + blob + "," + name, env=env)
        tree = git("write-tree", env=env)
        argv = ["commit-tree", tree]
        if parent:
            argv.extend(["-p", parent])
        return git(
            *argv,
            data="Refresh bounded public Atlas research snapshots\n",
            env={
                **env,
                "GIT_AUTHOR_NAME": "Atlas Owner Runtime",
                "GIT_AUTHOR_EMAIL": "atlas-runtime@users.noreply.github.com",
                "GIT_COMMITTER_NAME": "Atlas Owner Runtime",
                "GIT_COMMITTER_EMAIL": "atlas-runtime@users.noreply.github.com",
            },
        )
    finally:
        Path(index).unlink(missing_ok=True)
        Path(index + ".lock").unlink(missing_ok=True)


def publish(code_sha):
    journal_path = STATE / "publisher-journal.json"
    if journal_path.is_symlink():
        raise ValueError("Unsafe publication journal")
    journal = json.loads(journal_path.read_text()) if journal_path.exists() else {}
    remote = remote_head()
    if journal.get("status") == "push_attempted":
        candidate = journal["candidate"]
        if remote == candidate:
            journal.update(status="published", reconciledAt=datetime.now(UTC).isoformat())
            atomic(journal_path, journal)
            return {"status": "published_reconciled", "commit": candidate}
        if remote != journal.get("parent"):
            raise ValueError("Uncertain push diverged; refusing duplicate publication")
        # Retry the SAME candidate only after proving the first push did not reach origin.
        git("push", "origin", candidate + ":" + REF, timeout=40)
        if remote_head() != candidate:
            raise ValueError("Publication outcome remains unconfirmed")
        journal.update(status="published", reconciledAt=datetime.now(UTC).isoformat())
        atomic(journal_path, journal)
        return {"status": "published_reconciled", "commit": candidate}
    files = snapshots(code_sha)
    digests = json.loads(files["frontend/public/runtime-publication.json"])["sha256"]
    if (
        remote
        and remote == journal.get("candidate")
        and journal.get("codeSha") == code_sha
        and journal.get("sha256") == digests
    ):
        return {"status": "already_current", "commit": remote}
    if remote:
        check_existing_branch(remote)
    candidate = create_commit(files, remote)
    journal = {
        "status": "push_attempted",
        "candidate": candidate,
        "parent": remote,
        "codeSha": code_sha,
        "attemptedAt": datetime.now(UTC).isoformat(),
        "sha256": digests,
    }
    atomic(journal_path, journal)
    git("push", "origin", candidate + ":" + REF, timeout=40)
    if remote_head() != candidate:
        raise ValueError("Publication outcome remains unconfirmed")
    journal.update(status="published", publishedAt=datetime.now(UTC).isoformat())
    atomic(journal_path, journal)
    return {"status": "published", "commit": candidate}


def checkpoint_plan(previous, schedule, now):
    """Check completed 2h candles inside the existing 90-minute freshness gate.

    Five-minute settlement grace, no off-phase attempts, and at most three
    source-failure attempts per candle window. This never creates catch-up fills.
    """
    closed_epoch = int(now.timestamp() // 7200) * 7200
    phase = now.timestamp() - closed_epoch
    if not 300 <= phase <= 85 * 60:
        return None
    window = datetime.fromtimestamp(closed_epoch, UTC).isoformat()
    last_run = datetime.fromisoformat(previous["lastRunAt"].replace("Z", "+00:00"))
    if last_run.tzinfo is None:
        raise ValueError("Paper checkpoint has no source timezone")
    if last_run.timestamp() >= closed_epoch + 300 and previous.get("status") != "DEGRADED":
        return None
    attempts = schedule.get("attempts", 0) if schedule.get("windowClosedAt") == window else 0
    if type(attempts) is not int or not 0 <= attempts <= 3:
        raise ValueError("Invalid checkpoint attempt journal")
    if attempts >= 3:
        return None
    if attempts:
        last_attempt = datetime.fromisoformat(schedule["lastAttemptAt"])
        if last_attempt.tzinfo is None or last_attempt.timestamp() > now.timestamp() + 30:
            raise ValueError("Invalid checkpoint attempt timestamp")
        if (now - last_attempt).total_seconds() < 300:
            return None
    return {"windowClosedAt": window, "attempts": attempts + 1, "lastAttemptAt": now.isoformat()}


def cycle(*, include_retired_paper=False):
    prepare_state()
    lock_path = STATE / "report-publisher.lock"
    if lock_path.is_symlink():
        raise ValueError("Unsafe publisher lock")
    with lock_path.open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        code_sha = assert_approved_code()
        paper_path = PUBLISHED / "cloud-paper.json"
        if paper_path.is_symlink():
            raise ValueError("Unsafe paper output")
        initial_check = not paper_path.exists()
        if initial_check:
            atomic(paper_path, json.loads((ROOT / "frontend/public/cloud-paper.json").read_text()))
        old = json.loads(paper_path.read_text())
        schedule_path = STATE / "publisher-checkpoint-schedule.json"
        if schedule_path.is_symlink():
            raise ValueError("Unsafe checkpoint attempt journal")
        schedule = json.loads(schedule_path.read_text()) if schedule_path.exists() else {}
        # The active owner service refreshes IPO research only. Old comparison
        # checkpoints remain available to explicitly invoked archived research.
        plan = checkpoint_plan(old, schedule, datetime.now(UTC)) if include_retired_paper else None
        if plan:
            # Reserve before network I/O; restarts cannot create a retry burst.
            atomic(schedule_path, plan)
            output = run(
                [NODE, str(ROOT / "scripts/run_scheduled_paper.mjs"), "--owner-output"], timeout=100
            )
            (STATE / "publisher-paper-last.log").write_text(output[-15000:] + "\n")
        try:
            output = run([PYTHON, str(ROOT / "scripts/update_permitted_ipo.py")], timeout=45)
        except (RuntimeError, subprocess.TimeoutExpired) as error:
            if not (STATE / "ipo-feed.json").is_file():
                raise
            output = "Refresh unavailable; retaining dated prior evidence: " + type(error).__name__
        (STATE / "publisher-ipo-last.log").write_text(output[-3000:] + "\n")
        validate_artifacts()
        result = publish(code_sha)
        result.update(
            codeSha=code_sha,
            checkedAt=datetime.now(UTC).isoformat(),
            realOrdersEnabled=False,
            actualCapitalINR=0,
        )
        atomic(STATE / "publisher-health.json", result)
        return result


def wait_for_service_removal(domain, label):
    # bootout can return before launchd has released the label. Never bootstrap
    # a second publisher while the previous service is still registered.
    for _ in range(50):
        status = subprocess.run(  # noqa: S603 - fixed local launchd service
            ["/bin/launchctl", "print", domain + "/" + label],
            capture_output=True,
            check=False,
        )
        if status.returncode != 0:
            return
        time.sleep(0.1)
    raise RuntimeError("Previous publisher service is still stopping")


def install(verified_sha):
    prepare_state()
    if verified_sha != code_head() or len(verified_sha) != 40:
        raise ValueError("Verified exact code SHA is required")
    dirty = git("diff", "--name-only", verified_sha).splitlines()
    if set(dirty) - {
        "AGENTS.md",
        ".ai/HANDOFF.md",
        ".ai/AGENT_HANDOFF.json",
        ".ai/OBJECTIVE_ENVELOPE.json",
        ".ai/SURFACE_HANDOFF.json",
    }:
        raise ValueError("Commit and verify application changes before installing")
    atomic(
        STATE / "publisher-approval.json",
        {"codeSha": verified_sha, "branch": BRANCH, "approvedAt": datetime.now(UTC).isoformat()},
    )
    folder = Path.home() / "Library/LaunchAgents"
    folder.mkdir(parents=True, exist_ok=True)
    dest = folder / (LABEL + ".plist")
    if dest.is_symlink():
        raise ValueError("Unsafe LaunchAgent path")
    domain = "gui/" + str(os.getuid())
    if dest.exists():
        previous = plistlib.loads(dest.read_bytes())
        if previous.get("WorkingDirectory") != str(ROOT):
            raise ValueError("Existing publisher belongs to another checkout")
        subprocess.run(  # noqa: S603 - fixed owner LaunchAgent label
            ["/bin/launchctl", "bootout", domain + "/" + LABEL], capture_output=True, check=False
        )
        wait_for_service_removal(domain, LABEL)
    payload = {
        "Label": LABEL,
        "ProgramArguments": [PYTHON, str(Path(__file__).resolve()), "--loop"],
        "WorkingDirectory": str(ROOT),
        "EnvironmentVariables": ENV,
        "RunAtLoad": True,
        "KeepAlive": True,
        "ThrottleInterval": 60,
        "StandardOutPath": str(STATE / (LABEL + ".out.log")),
        "StandardErrorPath": str(STATE / (LABEL + ".err.log")),
    }
    dest.write_bytes(plistlib.dumps(payload))
    dest.chmod(0o600)
    run(["/bin/launchctl", "bootstrap", domain, str(dest)])
    return {"installed": LABEL, "codeSha": verified_sha, "branch": BRANCH}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--loop", action="store_true")
    parser.add_argument("--install", metavar="VERIFIED_SHA")
    args = parser.parse_args()
    if args.install:
        print(json.dumps(install(args.install)), flush=True)
        return
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_args: STOP.set())
    while not STOP.is_set():
        try:
            print(json.dumps(cycle()), flush=True)
        except Exception as error:
            print(
                json.dumps({"status": "not_published", "reason": type(error).__name__}), flush=True
            )
            if not args.loop:
                raise
        if not args.loop:
            return
        # Wake for completed-candle windows; provider responses remain hourly cached.
        # Unchanged artifact digests do not generate commits or app deployments.
        STOP.wait(300)


if __name__ == "__main__":
    main()
