from scripts.lean_dependency_audit import parse_advisories


def test_parse_lean_advisories_deduplicates_and_keeps_severity() -> None:
    line = (
        "Lean.csproj : warning NU1903: Package 'DotNetZip' 1.16.0 "
        "has a known high severity vulnerability, https://example.test/ghsa"
    )
    result = parse_advisories(line + "\n" + line)
    assert result == [
        {
            "package": "DotNetZip", "version": "1.16.0",
            "severity": "high", "url": "https://example.test/ghsa",
        }
    ]
