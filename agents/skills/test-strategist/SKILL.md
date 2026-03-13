# test-strategist

Use this skill when:

- a task spans multiple layers
- a task changes durable behavior without obvious seam coverage
- nondeterministic or runtime-heavy behavior needs a reliable test recommendation

Do not use this skill when:

- the task is a tiny local change with already-obvious, existing coverage

## Read First

- `docs/quality/testing-strategy.md`
- relevant subsystem docs
- issue brief or change context

## Checks

- seam types touched are explicit
- contract changes have at least one fast seam test recommendation
- integration or regression coverage is proposed when durable behavior changes
- nondeterminism is handled with stable fixtures or replayable outputs

## Workflow

1. Identify the seam types touched: unit, integration, protocol, native, golden, or end-to-end.
2. Specify the minimum fast seam test needed to make the change trustworthy.
3. Add integration or regression coverage when durable behavior changed.
4. Reject plans that change contracts without corresponding seam tests.

## Outputs

- tests to add or update
- risks left uncovered
- acceptable temporary gaps, if any

## Required Follow-Through

- explain why any temporary gap is temporary
- link follow-up work for any deferred coverage
- prefer deterministic fixtures, stable replay data, or golden outputs for runtime behavior

## Escalate When

- a contract changes with no viable seam test
- the proposed coverage relies on fragile timing assumptions
- temporary gaps are being accepted without follow-up ownership
