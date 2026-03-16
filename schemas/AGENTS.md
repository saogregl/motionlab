# Schemas Guide

## Ownership

The `.proto` files in `schemas/` are the canonical source of truth for the protocol and mechanism IR. All generated TypeScript and C++ bindings must derive from these schemas.

## Modification Rules

- Any breaking change to a `.proto` file must increment the protocol version in `packages/protocol/src/version.ts`.
- Schema changes must update both docs and generated inventories (`pnpm docs:generate`).
- Long-lived contract changes require an ADR under `docs/decisions/`.

## Codegen Status

Codegen is deferred to Epic 2 (Versioned Protocol and Mechanism IR Foundation). Types in `packages/protocol/src/version.ts` are currently hand-authored. Once the codegen pipeline is wired, generated files will live at:

- TypeScript: `packages/protocol/src/generated/`
- C++: `native/engine/src/generated/`
