# Native Engine Guide

`native/engine` is the authoritative native runtime boundary.

## Responsibilities

- native runtime bootstrap and WebSocket transport (`src/transport.cpp`)
- CLI argument parsing (`--port`, `--session-token`)
- binary protobuf-over-WebSocket protocol (Epic 2)
- structured stdout logging for Electron supervision (`[ENGINE] status=<state>`)
- future geometry/CAD processing
- simulation compilation and execution
- runtime output production
- native tests and protocol seam validation

## Dependencies

- `ixwebsocket` — WebSocket server and client (used in tests)
- `protobuf` — binary serialization (generated from schemas via Buf)
- managed via vcpkg (`vcpkg.json`, `CMakePresets.json` with `VCPKG_MANIFEST_MODE=ON`)

## Rules

- Keep backend-specific implementation details behind the native boundary.
- Do not leak backend-specific types into frontend-facing or protocol-facing contracts.
- Prefer user-meaningful diagnostics over raw backend failure text.
- Protect deterministic IDs and authored/runtime mapping.
- Keep runtime outputs aligned with stable channel semantics and live/replay contracts.
- Handle capability-dependent features through explicit detection and graceful degradation.
- Update architecture docs when native ownership or runtime topology changes.

## Required Checks

- `cmake --preset dev-mingw` (MinGW on Windows, requires `VCPKG_ROOT` env var)
- `cmake --preset dev-linux` (Linux GCC, requires `VCPKG_ROOT` env var)
- `cmake --preset msvc-dev` (MSVC, requires VS Developer Prompt + `VCPKG_ROOT`)
- `cmake --build build/<preset>`
- `ctest --preset <preset> -C Debug` (MSVC multi-config generator requires `-C Debug`)

Update `docs/architecture/runtime-topology.md`, `docs/architecture/results-architecture.md`, and ADRs for architecture-sensitive native changes.
