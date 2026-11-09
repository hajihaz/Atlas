"""Disposable synthetic credentials only; tests never consult the owner's file or broker."""

import json
import os
from pathlib import Path

import pytest

from atlas.integrations.credentials import read_analytics_credential
from tests.unit.test_atlas_research_cli import cli

FAKE_JWT = "e30.e30." + "a" * 64


def credential(tmp_path: Path, content: str | None = None) -> Path:
    os.chmod(tmp_path, 0o700)
    path = tmp_path / "analytics.env"
    path.write_text(content or ("UPSTOX_ANALYTICS_TOKEN=" + FAKE_JWT + "\n"))
    path.chmod(0o600)
    return path


def test_explicit_private_file_can_configure_status_without_a_network_call(tmp_path: Path):
    path = credential(tmp_path)
    assert read_analytics_credential(path) == FAKE_JWT
    result = cli("status", "--upstox-credential-file", str(path))
    assert result.returncode == 0, result.stdout + result.stderr
    report = json.loads(result.stdout)
    assert report["upstox_token_configured"] is True
    assert report["live_money_enabled"] is False
    assert FAKE_JWT not in result.stdout + result.stderr
    assert "Token presence does not verify" in report["notice"]


def test_existing_cli_without_file_never_implicitly_activates_owner_credentials():
    result = cli("status")
    assert result.returncode == 0
    assert json.loads(result.stdout)["upstox_token_configured"] is False


@pytest.mark.parametrize("file_mode,parent_mode", [(0o644, 0o700), (0o600, 0o755)])
def test_group_or_world_access_is_rejected(tmp_path: Path, file_mode: int, parent_mode: int):
    path = credential(tmp_path)
    path.chmod(file_mode)
    tmp_path.chmod(parent_mode)
    with pytest.raises(ValueError, match=r"private|permissions"):
        read_analytics_credential(path)


def test_symlink_and_nonregular_files_are_rejected(tmp_path: Path):
    path = credential(tmp_path)
    link = tmp_path / "alias.env"
    link.symlink_to(path)
    with pytest.raises(ValueError, match="symlinks"):
        read_analytics_credential(link)
    folder = tmp_path / "directory.env"
    folder.mkdir()
    with pytest.raises(ValueError, match="regular"):
        read_analytics_credential(folder)


@pytest.mark.parametrize("content", [
    "UPSTOX_ACCESS_TOKEN=unapproved-other-key\n",
    "UPSTOX_ANALYTICS_TOKEN=" + FAKE_JWT + "\nOTHER_KEY=no\n",
    "UPSTOX_ANALYTICS_TOKEN=$(touch should-never-execute)\n",
    "UPSTOX_ANALYTICS_TOKEN=" + "a" * 33000,
])
def test_malformed_or_extra_data_fails_without_echoing_values(tmp_path: Path, content: str):
    path = credential(tmp_path, content)
    result = cli("status", "--upstox-credential-file", str(path))
    assert result.returncode == 2
    assert "BLOCKED_OR_INVALID" in result.stdout
    assert FAKE_JWT not in result.stdout + result.stderr
    assert "touch should-never-execute" not in result.stdout + result.stderr
