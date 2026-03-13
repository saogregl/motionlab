# Repo Map

This is the human-maintained responsibility map. Use `docs/architecture/generated/` for machine-derived inventory.

## `apps/desktop`

Owns Electron lifecycle, preload, and native engine supervision.

- Public boundary: desktop runtime bootstrap and secure preload surface
- May depend on: `@motionlab/frontend`, `@motionlab/protocol`
- Must not own: simulation hot path, protocol semantics, product domain logic

## `apps/web`

Owns browser mounting of the shared frontend.

- Public boundary: web app entrypoint
- May depend on: `@motionlab/frontend`
- Must not own: product domain semantics or viewport/runtime contracts

## `packages/frontend`

Owns workbench UX, React-facing product state, inspectors, and editor flows.

- Public boundary: product-level frontend modules
- May depend on: `@motionlab/protocol`, `@motionlab/ui`, `@motionlab/viewport`
- Must not own: native authority or Babylon-specific hot-path state

## `packages/viewport`

Owns Babylon scene graph behavior, picking, overlays, and playback transforms.

- Public boundary: renderer-facing viewport integration
- May depend on: Babylon and stable runtime-facing contracts
- Must not own: authoritative authored state or protocol version policy

## `packages/protocol`

Owns TypeScript-side transport and version helpers.

- Public boundary: protocol bindings consumed by apps and frontend packages
- May depend on: schema-generated code and local helpers
- Must not depend on: frontend workbench concerns or native implementation details

## `packages/ui`

Owns reusable UI primitives and shared styles.

- Public boundary: design-system primitives
- May depend on: UI libraries only
- Must not depend on: product domain or protocol semantics

## `schemas/`

Owns the source of truth for wire and mechanism schemas.

- Public boundary: schema definitions
- May inform: protocol bindings and native/generated code
- Must not encode: backend-specific runtime objects

## `native/engine`

Owns the authoritative native execution boundary.

- Public boundary: native process and future runtime services
- May depend on: native libraries, generated schema bindings, future backend adapters
- Must not leak: backend-specific classes into product-facing contracts
