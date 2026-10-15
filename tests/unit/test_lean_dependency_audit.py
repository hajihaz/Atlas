from scripts.lean_dependency_audit import parse_advisories


def test_parse_lean_advisories_deduplicates_and_keeps_severity() -> None:
    line = (
        "Lean.csproj : warning NU1903: Package 'DotNetZip' 1.16.0 "
        "has a known high severity vulnerability, https://example.test/ghsa"
    )
    result = parse_advisories(line + "\n" + line)
    assert result == [
        {
            "package": "DotNetZip",
            "version": "1.16.0",
            "severity": "high",
            "url": "https://example.test/ghsa",
        }
    ]


def test_audit_detects_vulnerabilities_even_with_exit_zero() -> None:
    from scripts.lean_dependency_audit import audit_verdict

    table = (
        "Project `Example` has the following vulnerable packages\n"
        "   > DotNetZip 1.16.0 High https://example.test/critical\n"
        "                         Moderate https://example.test/moderate\n"
    )
    rows = parse_advisories(table)
    assert len(rows) == 2
    assert {item["severity"] for item in rows} == {"high", "moderate"}
    assert not audit_verdict(table, returncode=0, min_projects=1)


def test_audit_refuses_missing_projects_and_missing_assets() -> None:
    from scripts.lean_dependency_audit import audit_verdict

    clean = "The given project `Example` has no vulnerable packages given the current sources."
    assert audit_verdict(clean, returncode=0, min_projects=1)
    assert not audit_verdict(clean, returncode=0, min_projects=20)
    assert not audit_verdict(clean + "\nNo assets file was found", returncode=0, min_projects=1)
