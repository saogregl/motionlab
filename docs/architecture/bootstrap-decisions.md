# Bootstrap Decisions

Decisions made during initial repository setup. Each entry records what was chosen, what was considered, and why.

---

## Turborepo vs Nx

**Chosen: Turborepo**

Turborepo is simpler to configure, pnpm-native, and sufficient for a solo-dev monorepo. It handles task orchestration, caching, and dependency-aware builds with minimal configuration (a single `turbo.json`).

Nx was considered but rejected for this stage:
- Nx has a larger configuration surface and plugin ecosystem that adds overhead
- Nx generators and schematics are valuable for large teams but unnecessary here
- Turborepo's task graph and caching cover the needed use cases
- Migration from Turborepo to Nx is straightforward if needed later

**Revisit trigger:** If the monorepo grows to need code generation, advanced affected detection, or team-scale coordination, Nx may become worthwhile.

---

## vcpkg vs Conan

**Chosen: vcpkg (manifest mode)**

vcpkg in manifest mode provides per-project reproducible native dependency management via a `vcpkg.json` file, similar to how `package.json` works for Node.js.

Advantages over Conan:
- Seamless CMake integration via toolchain file
- Microsoft-maintained, large port catalog including OCCT, Chrono, Protobuf
- Manifest mode keeps everything local to the project
- Single `vcpkg.json` declares all dependencies
- Widely adopted in the C++ ecosystem

Conan was considered but not chosen:
- Conan requires a separate `conanfile.py` or `conanfile.txt` and its own profile system
- Integration with CMake is less seamless
- Package naming and versioning conventions differ from vcpkg's port model

vcpkg is expected to be installed system-wide (for example at `/opt/vcpkg`) and referenced via the `VCPKG_ROOT` environment variable. This avoids the ~50MB submodule overhead and is simpler for a solo-dev setup.

---

## Submodules vs Package-Manager-Managed Native Dependencies

**Chosen: Package-manager-managed (vcpkg ports)**

OCCT, Chrono, and Protobuf are all available as vcpkg ports. Using vcpkg ports instead of git submodules:

- Avoids the maintenance burden of tracking upstream releases manually
- Provides consistent build integration via vcpkg's CMake toolchain
- Handles transitive dependency resolution
- Keeps the repo size manageable (no multi-GB submodules for OCCT or Chrono)

The repository currently has no git submodules.

**Why not vendored source?** OCCT and Chrono are large projects with complex build systems. Vendoring would require maintaining custom build scripts and tracking upstream patches. vcpkg already does this work.

**Why not system packages?** System packages (apt, brew) don't guarantee version consistency across developer machines or CI. vcpkg manifest mode pins exact versions.

---

## Electron, Frontend, Protocol, and Engine Separation

### Architecture

```
┌─ apps/desktop ──────────────┐    ┌─ native/engine ─────────┐
│ Electron main process       │───>│ Standalone C++ process   │
│ - spawns engine             │    │ - listens on loopback    │
│ - manages windows           │    │ - WebSocket + Protobuf   │
│ - file dialogs              │    │ - OCCT, Chrono, etc.     │
└─────────┬───────────────────┘    └────────────┬─────────────┘
          │ loads                                │ direct connection
          ▼                                      │
┌─ packages/frontend ─────────┐                  │
│ React app shell             │                  │
│ - uses @motionlab/viewport  │◄─────────────────┘
│ - uses @motionlab/protocol  │
│ - uses @motionlab/ui        │
│ - uses zustand for state    │
└─────────────────────────────┘
```

### Packaging boundaries

| Package | Role | Boundary |
|---|---|---|
| `apps/desktop` | Electron main + preload | Process lifecycle, desktop integration. Does NOT relay simulation data. |
| `apps/web` | Browser entry | Mounts shared frontend in a browser context. |
| `packages/frontend` | App shell | Product UX, tool state, inspectors. Shared between desktop and web. |
| `packages/viewport` | Babylon.js layer | Scene graph, camera, picking, playback transforms. Receives data directly from engine. |
| `packages/protocol` | TS protocol bindings | Handshake, message types, version checking. Shared by frontend and desktop. |
| `packages/ui` | UI primitives | Headless, composable components. No domain knowledge. |
| `native/engine` | C++ executable | Authoritative for geometry, physics, simulation. Communicates via versioned protocol. |
| `schemas/` | Protobuf sources | Single source of truth for protocol and mechanism IR. Generates TS + C++ bindings. |

### Key rules preserved

1. **Engine is authoritative** — all geometry processing, mass properties, and simulation happen in the native engine
2. **Electron is a shell** — it spawns and supervises the engine but does not relay hot-path data
3. **Renderer connects directly** — the Babylon viewport receives simulation transforms via direct WebSocket, not through Electron IPC
4. **React is off the hot path** — simulation playback updates Babylon scene nodes imperatively
5. **Protocol is versioned** — frontend and engine communicate through explicit, typed messages defined in `schemas/`

---

## Protocol / Schema Strategy

**Source of truth:** `.proto` files in `schemas/`

**Codegen targets:**
- TypeScript: `protobuf-es` or `ts-proto` → generated into `packages/protocol/src/generated/`
- C++: `protoc` → generated into `native/engine/src/generated/`

**Current state (not yet wired):** Schema stubs are in place. The codegen pipeline (protobuf-es/ts-proto → TypeScript, protoc → C++) is planned but not yet connected. This will be wired in Epic 2 (Protocol Foundation).

**Versioning:** Protocol version is a simple integer in `packages/protocol/src/version.ts` and echoed in the Handshake message. Breaking changes increment the version and must be deliberate.

---

## CMake Presets Strategy

Two configure presets are defined:

| Preset | Purpose | vcpkg |
|---|---|---|
| `dev` | Debug build with tests | Yes (via `VCPKG_ROOT`) |
| `release` | Optimized build | Yes (via `VCPKG_ROOT`) |

Both presets use the vcpkg toolchain path derived from `VCPKG_ROOT`.

---

## Deferred Decisions

These will be made when the relevant epic begins:

- **WebSocket library for engine:** beast, uWebSockets, or websocketpp (Epic 1)
- **Protobuf codegen tooling details:** exact protoc plugin versions, build hooks (Epic 2)
- **Test framework for C++:** GoogleTest via vcpkg (when tests grow beyond placeholders)
- **Electron ↔ engine supervision protocol:** port negotiation, session tokens (Epic 1)
- **CI/CD pipeline:** GitHub Actions, caching strategy (pre-MVP hardening)
