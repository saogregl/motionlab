# architecture-guardian

Use this skill when:

- a task changes module boundaries, runtime layering, dependency direction, or protocol ownership
- a task introduces a new long-lived subsystem, package, or runtime layer

Do not use this skill when:

- the work is a local implementation change that stays inside an existing boundary and does not alter durable ownership

## Read First

- `AGENTS.md`
- `docs/architecture/index.md`
- `docs/architecture/principles.md`
- `docs/architecture/repo-map.md`
- affected subsystem docs
- relevant ADRs

## Checks

- dependency direction remains intentional
- ownership boundaries remain clear
- runtime topology stays consistent with docs
- public contracts remain product-facing rather than backend-shaped

## Workflow

1. Identify the boundary or ownership change being proposed.
2. Verify allowed and forbidden dependency direction for the affected areas.
3. Decide whether the change is local implementation work or a durable architecture decision.
4. List the docs, ADRs, and seam tests that must move with the change.

## Outputs

- affected boundaries
- invariants to preserve
- docs that must change
- tests or seam checks required
- ADR required: yes or no

## Required Follow-Through

- update the repo map or subsystem docs when boundaries move
- add or update ADRs when durable ownership or runtime topology changes
- flag any missing canonical docs needed to explain the change

## Escalate When

- public contracts or dependency direction change
- runtime topology changes
- docs conflict on current ownership
- the change introduces backend-specific concepts into product-facing layers
