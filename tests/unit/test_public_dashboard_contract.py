"""Public static Atlas preview must not contain capital credentials or imply live mode."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SAFE = {
    "source",
    "mode",
    "revision",
    "certifiedAt",
    "testsPassed",
    "testsSkippedLocal",
    "leanGoldenFixtures",
    "certificationGates",
    "historical",
    "historicalInitialCapital",
    "cohorts",
    "researchSourceHash",
    "liveCapitalBlocked",
}


def test_frontend_exports_only_allowlisted_offline_research_evidence():
    data = json.loads((ROOT / "frontend/src/data/snapshot.json").read_text())
    assert set(data) == SAFE
    assert data["liveCapitalBlocked"] is True
    assert data["source"] == "archived_lean_fixture_not_live_paper"
    assert len(data["historical"]) == 30
    assert len(data["cohorts"]) == 3
    assert data["certificationGates"] >= 17
    assert data["testsPassed"] > 0


def test_frontend_has_no_broker_backend_or_vite_secret_env():
    ui = (ROOT / "frontend/src/App.tsx").read_text()
    # Archived fixture values remain auditable, not rendered as current portfolio figures.
    assert "import snapshot" not in ui
    assert "historicalInitialCapital" not in ui
    assert "Broker orders remain disabled" in ui
    assert "OwnerStrategyPage" in ui
    # ADR-0070: the shell keeps the strategy lab and Debate X alongside the owner desk.
    assert "StrategyLabPage" in ui
    assert "DebateXPage" in ui
    assert "OwnerEvidencePage" in ui
    assert not any(
        secret in ui
        for secret in (
            "VITE_BROKER_",
            "UPSTOX_ACCESS_TOKEN",
            "CASHFREE_SECRET",
        )
    )
    assert "fetch(" not in ui
    assert (ROOT / "frontend/vercel.json").is_file()
