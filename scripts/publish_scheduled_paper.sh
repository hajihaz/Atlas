#!/usr/bin/env bash
# GitHub Actions ephemeral checkout only. Never run on the owner's Mac checkout.
# A racing main update must be re-observed, not rebased with simulated fills.
set -euo pipefail

if [[ "${GITHUB_ACTIONS:-}" != "true" || "${ATLAS_EXECUTION_MODE:-}" != "PAPER_ONLY" ]]; then
  echo "::error::Paper publisher requires a GitHub Actions research-only run."
  exit 2
fi
if [[ -z "${GITHUB_WORKSPACE:-}" || "$(cd "$GITHUB_WORKSPACE" && pwd -P)" != "$(pwd -P)" ]]; then
  echo "::error::Refusing to reset a non-ephemeral checkout."
  exit 2
fi
if [[ ! -d .git || -f frontend/public/real-orders.json ]]; then
  echo "::error::Unsafe runner checkout or real-order artifact."
  exit 2
fi

git config user.name "atlas-paper-research[bot]"
git config user.email "atlas-paper-research[bot]@users.noreply.github.com"

# Retry a MAXIMUM of three times within the SAME cron job (no new paid service).
# Each retry throws away the unpublished candidate and reruns source validation
# from the latest remote state. No backfill, cherry-pick or fabricated price.
for attempt in 1 2 3; do
  git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main
  git reset --hard refs/remotes/origin/main
  base_commit="$(git rev-parse HEAD)"
  test ! -f frontend/public/real-orders.json
  node scripts/run_scheduled_paper.mjs
  if git diff --quiet -- frontend/public/cloud-paper.json; then
    echo "No new report changes after source check; nothing to publish."
    exit 0
  fi
  git add -- frontend/public/cloud-paper.json
  if [[ "$(git diff --cached --name-only)" != "frontend/public/cloud-paper.json" ]]; then
    echo "::error::Publisher staging exceeded the single approved research ledger."
    exit 2
  fi
  git commit -m "data(atlas): scheduled virtual paper snapshot [skip ci]"
  if git push origin HEAD:refs/heads/main; then
    echo "Forward research checkpoint published from latest source (attempt $attempt)."
    exit 0
  fi

  # Only a newer remote main warrants another source-backed attempt.
  # Permission, auth and unrelated push failure must NOT cause retry storms.
  git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main
  if [[ "$(git rev-parse refs/remotes/origin/main)" == "$base_commit" ]]; then
    echo "::error::Paper push failed without an upstream race; not retrying."
    exit 1
  fi
  echo "::warning::main advanced during virtual paper publish; discarding stale candidate and revalidating. Attempt $attempt of 3."
done
echo "::error::Three bounded source-revalidated publish attempts exhausted. No force-push or backfill."
exit 1
