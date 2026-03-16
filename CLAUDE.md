# MotionLab — Claude Code Context

> This file mirrors AGENTS.md. Keep both in sync.

MotionLab is a desktop-first, offline-capable mechanism authoring and simulation workbench. The native engine is authoritative for geometry, mass properties, simulation, and runtime outputs. The frontend owns authoring UX, visualization, and inspection.

## Start Here

Read in this order before changing code:

1. `docs/architecture/index.md`
2. `docs/architecture/principles.md`
3. `docs/architecture/repo-map.md`
4. The relevant subsystem document under `docs/architecture/` or `docs/domain/`
5. Relevant ADRs under `docs/decisions/`
6. The issue brief or PR context

## Non-Negotiable Rules

- Do not treat code as the only source of architecture truth. Update docs when durable behavior or boundaries change.
- Do not leak Chrono or other backend-specific concepts through product-facing protocol or frontend contracts.
- Treat sensors as first-class authored entities mounted to datums, not backend runtime objects.
- Treat simulation runs as immutable artifacts.
- Keep live and replay output semantics aligned through channel-based contracts.
- React is not the hot path for viewport playback or dense runtime updates.
- Electron is a shell and supervisor, not the simulation data bus.

## Required Change Hygiene

### Pre-MVP (Epics 1-4): Lighter Process

During early vertical-slice development, apply a lighter process to maintain iteration speed:

- Commit messages reference the epic (e.g., "Epic 1: ...").
- Tests are required at integration seams only (protocol handshake, engine spawn, scene graph identity).
- Doc updates are batched — update subsystem docs when an epic completes, not per-commit.
- ADRs are still required for boundary or contract changes that affect multiple packages.

### Post-Vertical-Slice (Epics 5+): Full Process

Once the first end-to-end slice (Epics 1-4) is validated, tighten to full governance:

- Any architecture-sensitive change must update the relevant subsystem docs.
- Any boundary or long-lived contract change requires an ADR.
- Any protocol, schema, sensor, results, or runtime contract change must add or update tests at the seam it affects.
- Every meaningful PR must state the linked brief or issue, affected modules, tests changed, docs updated, and whether an ADR was required.

## Local Guides

Read the nearest local `AGENTS.md` as well when working in a specific area:

- `apps/AGENTS.md`
- `packages/frontend/AGENTS.md`
- `packages/viewport/AGENTS.md`
- `packages/protocol/AGENTS.md`
- `native/engine/AGENTS.md`
- `packages/ui/AGENTS.md`
- `docs/AGENTS.md`

## Skills

Reusable project skills live under `agents/skills/`. Use them when the task touches architecture, protocol/schema boundaries, sensors/results, testing strategy, or documentation curation.

## Generated Docs

Generated docs under `docs/architecture/generated/` may be stale. Run `pnpm prepare:agents` before reading them to ensure they reflect the current repo state.
