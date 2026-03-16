# System Overview

MotionLab is split into a frontend/app layer, a protocol/schema layer, and a native engine layer.

## Current High-Level Shape

- `apps/desktop` packages the Electron shell and local engine supervision.
- `apps/web` hosts the shared frontend in a browser context.
- `packages/frontend` owns the product workbench and React-facing state.
- `packages/viewport` owns Babylon scene behavior, playback transforms, picking, and overlays.
- `packages/protocol` owns TypeScript protocol bindings and version helpers.
- `packages/ui` owns reusable UI primitives.
- `schemas/` owns source schemas for transport and mechanism modeling.
- `native/engine` owns the native executable boundary.

## Target Architectural Direction (Planned)

> The following describes the intended architecture. These subsystems are not yet implemented.

- Durable authored data is modeled as product, model, scenario, and run artifacts.
- The native runtime compiles authored state into backend-specific execution.
- Results are exposed through stable channel descriptors and shared live/query/replay semantics.
- Frontend modules consume stable contracts rather than backend implementation details.
