# Docs Guide

The docs tree is part of the product architecture, not optional commentary.

## Responsibilities

- maintain durable technical truth
- keep canonical docs aligned with code and ADRs
- preserve generated docs as reproducible artifacts, not hand-authored truth

## Rules

- Keep durable technical truth in `docs/`.
- Prefer small, maintained documents over giant narrative dumps.
- Update docs in the same change that alters behavior, contracts, boundaries, or workflow expectations.
- Use ADRs for durable decisions, not for transient implementation notes.
- Never hand-edit `docs/architecture/generated/`; refresh it from scripts.
- Canonical doc hierarchy is:
  - ADRs define durable decisions
  - architecture docs define current structure and ownership
  - domain docs define product semantics
  - generated docs are machine-derived and never canonical
  - `AGENTS.md` and skills define workflow expectations, not product truth
- If docs and code disagree on durable behavior, flag it and update the stale truth in the same change when feasible.

## Required Checks

- `pnpm docs:check`
- `pnpm docs:generate`

If you change the expected reading order or agent workflow, update the root `AGENTS.md` and the relevant skill.
