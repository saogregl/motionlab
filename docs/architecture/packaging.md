# Packaging

How to build and package MotionLab for desktop distribution.

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
pnpm package:desktop
```

This builds the engine in release mode, then runs `electron-forge package`. Output is in `apps/desktop/out/`.

## Distribution Formats

- **Linux:** DEB (via `@electron-forge/maker-deb`)
- **Windows:** ZIP (via `@electron-forge/maker-zip`)
- **macOS:** ZIP (via `@electron-forge/maker-zip`) — untested

## Runtime Topology

The engine binary is bundled as an Electron `extraResource` (outside the ASAR archive). At startup, `EngineSupervisor.resolveEnginePath()` finds it at `process.resourcesPath/motionlab-engine`.

## Log Files

Engine stdout/stderr and supervisor events are written to `{userData}/logs/motionlab-{timestamp}.log`. Access via Help > Show Logs in the command palette. Log files older than 7 days are automatically deleted on startup.
