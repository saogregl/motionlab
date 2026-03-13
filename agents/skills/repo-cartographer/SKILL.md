# repo-cartographer

Use this skill when:

- scoping a task before implementation
- reviewing a change that spans multiple modules
- refreshing the repo map after structure or ownership changes

Do not use this skill when:

- the task is clearly isolated to one file or one local implementation detail with no boundary impact

## Read First

- `docs/architecture/repo-map.md`
- `docs/architecture/generated/repo-tree.md`
- `docs/architecture/generated/workspace-dependencies.md`
- `docs/architecture/generated/package-exports.md`

## Checks

- affected modules are identified
- dependency direction at risk is called out
- human-maintained docs and generated inventory do not silently diverge

## Workflow

1. Compare the human repo map with generated inventory.
2. Identify the packages, apps, native areas, schemas, and docs touched by the task.
3. Check whether the change crosses intended layer boundaries.
4. Decide which map is stale if the human and generated views disagree.

## Outputs

- affected modules
- public interfaces at risk
- dependency direction at risk
- tests to update
- generated reports to refresh
- docs and tests that must be updated

## Required Follow-Through

- refresh generated reports after structure or export changes
- update the human repo map if the intended ownership changed
- flag stale maps rather than silently choosing one

## Escalate When

- a change crosses intended layer boundaries
- the human and generated maps disagree on ownership
- a new package or subsystem is introduced
