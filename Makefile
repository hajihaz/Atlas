# Atlas — developer entrypoints. See docs/development/development-foundation.md.
# Production uses `uv` + pytest/ruff/mypy. The `core-test` target runs the pure-stdlib
# domain core with ZERO third-party deps (works on a bare Python), which is how the core
# is verified in constrained environments and in CI's "no-deps" job.

.PHONY: help install lock test core-test lint type audit secrets ci clean migrate

help:  ## Show targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  %-12s %s\n",$$1,$$2}'

install:  ## Create env & install (uv)
	uv sync --all-extras --dev

lock:  ## Regenerate the hash-locked dependency file (supply-chain, ADR 0009)
	uv lock

test:  ## Full test suite (pytest)
	uv run pytest

core-test:  ## Pure-stdlib domain-core tests — no third-party deps required
	PYTHONPATH=src python3 -m unittest discover -s tests/unit -p 'test_*.py' -v

lint:  ## Lint + format check
	uv run ruff check . && uv run ruff format --check .

type:  ## Strict static typing
	uv run mypy src

audit:  ## Dependency vulnerability scan (supply-chain)
	uv run pip-audit

secrets:  ## Scan for committed secrets (threat model)
	uv run detect-secrets scan

migrate:  ## Apply DB migrations
	uv run alembic upgrade head

ci: lint type test audit secrets  ## Everything CI runs

clean:  ## Remove caches
	rm -rf .pytest_cache .mypy_cache .ruff_cache .hypothesis htmlcov .coverage
	find . -type d -name __pycache__ -prune -exec rm -rf {} +
