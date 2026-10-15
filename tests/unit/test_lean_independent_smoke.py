from scripts.lean_independent_smoke import (
    SUCCESS_MARKER,
    certified_compression_result,
)


def test_compression_smoke_requires_exact_successful_process() -> None:
    assert certified_compression_result(SUCCESS_MARKER + "\n", 0)
    assert not certified_compression_result(SUCCESS_MARKER, 1)
    assert not certified_compression_result("fake " + SUCCESS_MARKER + " extra", 0)
    assert not certified_compression_result("BUILD FAILED", 0)
