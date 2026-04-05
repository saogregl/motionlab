# Packaging

How to build and package MotionLab for desktop distribution and GitHub Releases.

## Prerequisites

- Node.js >= 20 with pnpm
- CMake >= 3.25
- vcpkg (auto-bootstrapped via CMake preset)
- C++20 compiler (GCC 12+, Clang 15+, MSVC 2022+)

## Build the Engine

```bash
# Linux
pnpm build:engine

# Windows (MinGW)
pnpm build:engine:win
```

This runs the `release-linux` (or `release-mingw`) CMake preset and copies the binary to `native/engine/build/release/`.

## Package the Desktop App

```bash
# Linux
pnpm package:desktop

# Windows
pnpm package:desktop:win
```

These commands first refresh the hoisted `apps/desktop` install that Electron Forge expects, then build the platform-specific release engine and run `electron-forge make`. Output is in `apps/desktop/out/`.

To build the unpacked desktop bundle without installers:

```bash
pnpm --filter @motionlab/desktop run package
```

## Distribution Formats

- **Linux:** DEB (via `@electron-forge/maker-deb`)
- **Windows:** Squirrel installer assets: `Setup.exe`, `RELEASES`, `.nupkg` (via `@electron-forge/maker-squirrel`)
- **macOS:** ZIP (via `@electron-forge/maker-zip`) — untested

## GitHub Releases

The repository ships a tag-driven GitHub Actions release workflow in `.github/workflows/release.yml`.

- Push a tag in the form `vX.Y.Z`
- The workflow validates that `package.json` and `apps/desktop/package.json` both match `X.Y.Z`
- Linux builds a `.deb`
- Windows builds Squirrel installer assets
- The final job creates a GitHub Release for the tag and uploads all generated assets

## Runtime Topology

The engine binary is bundled as an Electron `extraResource` (outside the ASAR archive). At startup, `EngineSupervisor.resolveEnginePath()` finds it at `process.resourcesPath/motionlab-engine`.

## Log Files

Engine stdout/stderr and supervisor events are written to `{userData}/logs/motionlab-{timestamp}.log`. Access via Help > Show Logs in the command palette. Log files older than 7 days are automatically deleted on startup.
