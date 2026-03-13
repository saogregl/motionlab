# protocol-schema-steward

Use this skill when:

- editing schema files, generated bindings, or protocol helpers
- changing runtime channel contracts or compatibility expectations

Do not use this skill when:

- the work is purely frontend presentation with no protocol or schema impact

## Read First

- `packages/protocol/AGENTS.md`
- `docs/architecture/protocol-overview.md`
- relevant ADRs for protocol or runtime contracts

## Checks

- generated bindings remain read-only
- versioning and compatibility expectations are explicit
- live and replay channel semantics stay aligned
- protocol types remain product-facing rather than backend-shaped

## Workflow

1. Identify the source-of-truth schema or contract being changed.
2. Check whether the change affects versioning, compatibility, generated bindings, or live and replay semantics.
3. Verify that the change remains product-facing and backend-agnostic.
4. Specify the tests, examples, or migration notes required.

## Outputs

- contract surface changing
- compatibility risk
- generated artifacts to refresh
- golden examples or seam tests to update
- docs and ADR impact

## Required Follow-Through

- update protocol docs
- refresh generated reports if exports or schemas moved
- add or adjust seam tests
- refresh sample payloads or golden expectations when contracts change
- add migration notes when long-lived contract behavior changes
- create an ADR if the contract direction changes

## Escalate When

- public wire compatibility changes
- live and replay semantics diverge
- generated bindings were edited directly
- schema source of truth is unclear or missing
