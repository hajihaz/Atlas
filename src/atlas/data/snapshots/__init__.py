"""Immutable, content-addressed data snapshots (ADR 0014)."""

from __future__ import annotations

from atlas.data.snapshots.manifest import SnapshotManifest, build_manifest, verify_manifest

__all__ = ["SnapshotManifest", "build_manifest", "verify_manifest"]
