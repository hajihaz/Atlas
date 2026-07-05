"""Reference vendor adapters.

Two adapters with **different native formats** (CSV rows vs. JSON dicts) prove that
swapping a vendor changes nothing downstream: both emit identical canonical bars for the
same logical data. No network, fully deterministic — suitable for tests and dev. Real
vendor adapters (with auth, retries, and cross-source corroboration) arrive with their
own ADR when a live vendor is selected.
"""

from __future__ import annotations

from atlas.data.ingestion.adapters.mock_csv import MockCsvAdapter
from atlas.data.ingestion.adapters.mock_json import MockJsonAdapter

__all__ = ["MockCsvAdapter", "MockJsonAdapter"]
