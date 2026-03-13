# docs-and-adr-curator

Use this skill when:

- architecture, workflows, or public contracts changed
- canonical docs, ADRs, or generated inventories may now be stale

Do not use this skill when:

- the task is making the architecture decision itself rather than curating the documentation around it

## Read First

- `docs/AGENTS.md`
- affected architecture or domain docs
- relevant ADRs
- generated docs under `docs/architecture/generated/`

## Checks

- canonical and generated docs are not being confused
- generated docs remain reproducible and never hand-edited
- ADR thresholds are applied consistently
- stale-truth conflicts are resolved explicitly

## Workflow

1. Identify which canonical docs are stale.
2. Decide whether the change needs subsystem doc updates, repo map updates, ADR creation, or brief and template updates.
3. Refresh generated docs if inventories changed.
4. Resolve any conflicts between docs by identifying which source is stale.

## Outputs

- stale canonical docs
- stale generated docs
- ADR required: yes or no
- follow-up docs or brief updates required

## Required Follow-Through

- keep docs concise and current
- avoid duplicating the same truth in multiple places
- update root or local `AGENTS.md` if agent workflow changed
- never hand-edit generated docs

## Escalate When

- docs disagree on durable truth
- runtime topology, storage or replay semantics, dependency direction, or public contracts changed
- the canonical doc for a change is missing and must be created
