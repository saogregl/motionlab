# Review Workflow

## Every Meaningful PR Must Include

- linked issue or brief
- affected modules
- tests added or changed
- docs updated
- ADR required: yes or no

## Review Lenses

- implementation correctness
- architecture and dependency direction
- protocol or schema compatibility
- results and sensor contract integrity
- documentation completeness

Architecture-sensitive changes are incomplete if they land without updated docs or seam tests.

## Required CI Checks

The following CI jobs must pass before merge:

- **`js-and-docs`** — always required (lint, typecheck, tests, docs check)
- **`native-smoke`** — required if native code (`native/`) changes
- **`docs-quality`** — required if docs, AGENTS.md files, agent skills, scripts, readme, or plan change
