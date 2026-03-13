# results-storage-architect

Use this skill when:

- working on live store, replay store, recording, downsampling, or output retention behavior
- changing query semantics, storage format assumptions, or retention policy

Do not use this skill when:

- the task is only UI presentation over existing results contracts

## Read First

- `docs/architecture/results-architecture.md`
- `docs/domain/channel-model.md`
- relevant ADRs

## Checks

- the affected data family is explicit: traces, poses, events, raster frames, or blob frames
- live and replay semantics remain aligned
- memory growth, disk growth, retention defaults, and query semantics are reviewed together
- recording defaults and archival behavior are explicit

## Workflow

1. Identify the data family and retention policy affected.
2. Check memory growth, disk footprint, chunking, summaries, and query semantics.
3. Verify that live-only or replay-only semantics are not introduced without a contract review.
4. Specify the tests and docs that prove the new behavior.

## Outputs

- data family affected
- live and replay contract impacts
- retention and storage impacts
- tests and docs to update

## Required Follow-Through

- update results docs
- add seam tests or golden tests
- document any retention or recording policy changes
- document disk-growth or archival implications when they change

## Escalate When

- live and replay semantics diverge
- retention defaults change without product review
- storage format or query semantics become incompatible without migration notes
