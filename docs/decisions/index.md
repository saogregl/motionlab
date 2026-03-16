# Architecture Decision Records

| ADR | Title | Status | Summary |
|-----|-------|--------|---------|
| [ADR-0001](ADR-0001-repo-truth-and-github-execution.md) | Repo Truth and GitHub Execution | Accepted | Repository is the single source of truth; GitHub is the execution platform for all project work. |
| [ADR-0002](ADR-0002-sensors-are-first-class-authored-entities.md) | Sensors Are First-Class Authored Entities | Accepted | Sensors are persisted authored entities mounted to datums, not transient backend runtime objects. |
| [ADR-0003](ADR-0003-runs-and-channel-contracts.md) | Runs Are Immutable and Channels Unify Live and Replay | Accepted | Simulation runs are immutable artifacts; channel descriptors provide unified live/query/replay semantics. |

## Adding a New ADR

Use `docs/decisions/ADR-template.md` as the starting template. Number sequentially (ADR-0004, etc.) and update this index.
