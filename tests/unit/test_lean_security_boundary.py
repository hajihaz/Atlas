from scripts.lean_golden_certify import _lean_environment


def test_lean_golden_fixture_environment_does_not_inherit_secrets() -> None:
    inherited = {
        "HOME": "/tmp/home",
        "PATH": "/usr/bin",
        "UPSTOX_SANDBOX_ACCESS_TOKEN": "do-not-leak",
        "DATABASE_URL": "postgresql://private",
        "BROKER_LIVE_TOKEN": "do-not-leak",
    }
    clean = _lean_environment(inherited)
    assert clean["PATH"] == "/usr/bin"
    assert clean["HOME"] == "/tmp/home"
    assert clean["DOTNET_ROOT"].endswith(".tooling/dotnet")
    assert all("do-not-leak" not in value for value in clean.values())
    assert "DATABASE_URL" not in clean
    assert "UPSTOX_SANDBOX_ACCESS_TOKEN" not in clean
