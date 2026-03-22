# ADR-0011: Missing Asset Recovery and Cache Validation Contract

**Status:** Accepted

## Context

When loading a project, referenced CAD source files may be missing (moved/deleted) or their content may have changed since the project was saved. The engine needs to detect these conditions and provide a recovery path to the frontend. Additionally, the asset cache may become corrupted, requiring re-derivation from source files.

## Decision

### Protocol additions (additive, non-breaking)

- `LoadProjectSuccess` extended with `repeated MissingAssetInfo missing_assets` (field 4).
- `MissingAssetInfo` carries `body_id`, `body_name`, `expected_asset` (AssetReference), and `reason` (one of: `file_not_found`, `hash_mismatch`, `cache_corrupted`).
- `RelocateAssetCommand` (Command oneof field 42) lets the frontend request a re-import from a new file path for a specific body.
- `RelocateAssetResult` (Event oneof field 42) returns the updated `BodyImportResult` on success.

### Mechanism schema additions

- `BodyDisplayData` extended with `density` (field 4), `tessellation_quality` (field 5), and `unit_system` (field 6). These enable cache key reconstruction on load without requiring the original import command parameters.

### Engine behavior on load

1. After restoring mechanism state and display data from the project file, the engine iterates each body's `source_asset_ref`.
2. If the source file exists and the content hash matches, the topology context is restored (face-picking available).
3. If the hash differs, the body is reported as `hash_mismatch` in `missing_assets`.
4. If the source file is missing, the body still renders from embedded display mesh data. Face-picking is unavailable until the asset is relocated.

### RelocateAsset flow

1. Frontend opens a file dialog and sends `RelocateAssetCommand` with the new path.
2. Engine re-imports the file, updates the body's asset reference and display data, and registers the topology context.
3. Frontend updates the scene graph with the new mesh data.

### Version migration skeleton

`ProjectFile.version` (existing field 1) is checked on load. Version 0 (unset) is treated as 1. Versions above `CURRENT_PROJECT_VERSION` are rejected with a clear error. A `migrate_project_file()` no-op skeleton exists for future migrations.

## Consequences

- PROTOCOL_VERSION remains at 2 (all changes are additive).
- Bodies with missing assets are fully renderable from embedded mesh data; only face-level editing is degraded.
- The recovery dialog is optional — users can continue without relocating.
- `AssetCache::remove()` enables cleanup of corrupt cache entries.
- `AssetCache::compute_file_hash()` provides standalone SHA-256 for content validation without import parameters.
