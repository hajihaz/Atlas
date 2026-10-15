#!/bin/zsh
# Apply the approved, frozen LEAN security patch without touching unrelated files.
set -euo pipefail
ROOT="${0:A:h:h}"
LEAN="$ROOT/Lean"
PATCH="$ROOT/scripts/lean-patches/0001-lean-security-packages.patch"
PINNED_LEAN_SHA="f24fc0d3df03d6bdbe0e6fc7b8522445f1d900d2" # pragma: allowlist secret - public Git SHA
CHANGED=(
  Compression/QuantConnect.Compression.csproj
  Messaging/QuantConnect.Messaging.csproj
  Tests/QuantConnect.Tests.csproj
  Tests/Compression/CompressionTests.cs
)
if [[ ! -d "$LEAN/.git" && ! -f "$LEAN/.git" ]]; then
  echo "LEAN repository not present; refusing patch" >&2
  exit 2
fi
if [[ "$(git -C "$LEAN" rev-parse HEAD)" != "$PINNED_LEAN_SHA" ]]; then
  echo "LEAN revision mismatch; review compatibility before applying patch" >&2
  exit 2
fi
if git -C "$LEAN" apply --reverse --check "$PATCH" 2>/dev/null; then
  if ! cmp -s <(git -C "$LEAN" diff -- "${CHANGED[@]}") "$PATCH"; then
    echo "LEAN patch targets contain additional edits; refusing changes" >&2
    exit 2
  fi
  echo "LEAN security patch already applied exactly"
  exit 0
fi
if ! git -C "$LEAN" diff --quiet -- "${CHANGED[@]}"; then
  echo "LEAN patch target files have unexpected edits; refusing changes" >&2
  exit 2
fi
git -C "$LEAN" apply --check "$PATCH"
git -C "$LEAN" apply "$PATCH"
echo "LEAN security patch applied to pinned revision"
