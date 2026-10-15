from pathlib import Path


def test_ci_uses_supported_python_and_ephemeral_postgres_for_integrations():
    workflow = Path(".github/workflows/ci.yml").read_text()
    assert 'python-version: "3.11"' in workflow
    assert "ATLAS_EXECUTION_TEST_DB:" in workflow
    assert "ATLAS_TEST_DB:" in workflow
    assert "image: postgres:17" in workflow
    assert "python -m pytest -q" in workflow
    assert "python -m pip_audit" in workflow
    assert "permissions:" in workflow
    assert "contents: read" in workflow
    assert "deploy" not in workflow.lower()
    assert "broker-access-token" not in workflow.lower()


def test_ci_audit_setuptools_floor_cannot_use_known_vulnerable_version():
    workflow = Path(".github/workflows/ci.yml").read_text()
    project = Path("pyproject.toml").read_text()
    assert "setuptools>=83.0.0" in workflow
    assert '"setuptools>=83.0.0"' in project
