# ADR-0001: Repo Truth and GitHub Execution

- Status: Accepted
- Date: 2026-03-13
- Decision makers: MotionLab maintainers

## Context

MotionLab needs long-term agent readiness. Durable technical truth must stay versioned with code, while execution tracking needs a real issue and PR workflow.

## Decision

Keep durable architecture, workflows, ADRs, and subsystem truth in the repository. Use GitHub Issues and GitHub Projects as the execution layer. Use root and subtree `AGENTS.md` files plus repo-owned skills as the stable agent interface.

## Consequences

- architecture truth stays reviewable and versioned with code
- execution work is tracked outside ad hoc markdown task lists
- agents have stable entrypoints and reusable workflows
