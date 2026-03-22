# MotionLab

> A modern, offline-capable multibody dynamics workbench for mechanical engineers.

MotionLab is a hybrid desktop/web engineering application for authoring, inspecting, and simulating mechanical systems. It combines a high-velocity React/Babylon user experience with a native C++ engine for CAD processing, mass-property extraction, and multibody dynamics.

The product exists to make professional-grade mechanism analysis feel accessible, modern, and fast. It is not a general CAD modeler. It is an **assembler, analyzer, and simulator** for imported geometry and engineer-defined mechanisms.

---

## Product Identity

**What MotionLab is:**

- a mechanism authoring environment
- a multibody dynamics front-end
- a CAD-derived mass property and mesh pipeline
- a desktop-first engineering application with a shared web-capable frontend
- a platform built around a transport-agnostic Mechanism IR

**What MotionLab is not:**

- a full parametric CAD modeler
- a mesh sculpting tool
- a game engine editor
- a browser-only toy physics demo
- a solver-locked UI married permanently to one backend implementation

## Core Mental Model

The application is based on the idea that engineers should define mechanisms through **frames, bodies, and constraints**, not by dragging ad hoc pivots onto triangles.

- **Bodies** — rigid parts with geometry, mass, center of mass, and inertia
- **Datums** — local coordinate frames anchored to bodies
- **Joints** — typed relationships between two datums
- **Mechanisms** — systems of rigid bodies and constraints compiled into a solver model

---

## UX Philosophy

- **Frame-first authoring** — all joints are defined between explicit datum frames on meaningful CAD features
- **Engineering-grade interaction** — precise picking, stable cameras, deterministic overlays over cinematic presentation
- **Dual-mode rendering** — engineering mode for authoring; presentation mode for communication
- **Fast where it matters** — React for product UX, imperative updates for simulation playback

---

## North-Star Principles

1. The native engine is the product core (geometry, physics, simulation)
2. The renderer is not the source of truth
3. React never owns the hot path
4. The Mechanism IR is the stable contract
5. Desktop and cloud share one protocol
6. The product is an assembler/analyzer, not a CAD modeler
7. Imported geometry and solver state are different assets
8. Performance is designed, not hoped for

---

## Technology Stack

### Frontend

- React 19 + TypeScript + Vite
- Babylon.js for viewport and scene systems
- Zustand for structured UI state
- uPlot for engineering charts

### Native Engine

- Modern C++20
- OpenCASCADE for CAD import and B-Rep processing
- Project Chrono for multibody dynamics
- Optional ROS2 integration

### Desktop Runtime

- Electron as shell and lifecycle manager (not the hot-path transport)

### Transport

- Direct renderer-to-engine WebSocket communication
- Protobuf for command and state messages

### Build & Workspace

- pnpm workspaces + Turborepo
- CMake + Ninja + Presets for native builds
- vcpkg manifest mode for reproducible native dependencies

---

## Repository Structure

```text
apps/
  desktop/            # Electron shell
  web/                # Browser build of the frontend

packages/
  frontend/           # React app shell and product modules
  viewport/           # Babylon scene, picking, overlays, playback
  protocol/           # Protobuf schema, TS bindings, versioning helpers
  ui/                 # Design system and reusable UI primitives

native/
  engine/             # C++ executable (OCCT, Chrono, protocol server)

schemas/              # Protobuf source schemas (source of truth)

docs/                 # Architecture, domain, decisions, workflows
```

---

## Prerequisites

- Node.js >= 20
- pnpm
- CMake >= 3.25
- vcpkg (with `VCPKG_ROOT` set)
- C++20 compiler (GCC 12+, Clang 15+, or MSVC 2022)

## Quick Start

```bash
pnpm install && pnpm dev:desktop
```

### Other Commands

```bash
# Run the web frontend in dev mode
pnpm dev:web

# Lint and typecheck
pnpm check

# Package the desktop app for distribution
pnpm package:desktop

# Generate docs inventories and validate structure
pnpm prepare:agents
```

### Native Engine Build

```bash
cd native/engine
cmake --preset dev
cmake --build build/dev
ctest --preset dev
```

### Sample Projects

Example project files are available in [`apps/desktop/examples/`](apps/desktop/examples/).

---

## Documentation

Detailed documentation lives in `docs/`:

- **Architecture:** [`docs/architecture/index.md`](docs/architecture/index.md) — start here
- **Known Limitations:** [`docs/known-limitations.md`](docs/known-limitations.md)
- **Principles:** `docs/architecture/principles.md`
- **Repo Map:** `docs/architecture/repo-map.md`
- **System Overview:** `docs/architecture/system-overview.md`
- **Runtime Topology:** `docs/architecture/runtime-topology.md`
- **Protocol:** `docs/architecture/protocol-overview.md`
- **Domain Model:** `docs/domain/glossary.md`, `docs/domain/product-model.md`
- **Decisions (ADRs):** `docs/decisions/index.md`
- **Testing Strategy:** `docs/quality/testing-strategy.md`
- **Performance Budget:** `docs/quality/performance-budget.md`
- **Development Workflow:** `docs/workflows/development-workflow.md`
- **Review Workflow:** `docs/workflows/review-workflow.md`

## Agent & AI Context

- **Agent guide:** `AGENTS.md` — non-negotiable rules and reading order
- **Claude Code context:** `CLAUDE.md` — mirrors AGENTS.md
- **MVP plan:** `plan.md` — epic specifications and execution order
- **Agent skills:** `agents/skills/` — reusable project skills

---

## Strict Architectural Rules

These rules are binding. See `AGENTS.md` for the full list.

1. One product, two execution topologies (desktop and cloud share semantics)
2. Electron is a shell, not a solver bus
3. The renderer connects directly to the engine
4. Keep React off the simulation hot path
5. The engine owns geometry truth
6. No runtime dependency on live internet for desktop core workflows
7. Every body has layered representations
8. Incremental invalidation only
9. Mechanism IR is explicit and versioned
10. Precision beats convenience
