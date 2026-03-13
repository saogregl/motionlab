# Testing Strategy

MotionLab needs seam-focused testing rather than one generic framework.

## Required Layers

- TypeScript unit and integration tests for frontend and package logic
- Native unit and integration tests through CTest
- Protocol and schema contract tests
- Results and channel contract tests
- Golden tests for generated catalogs or deterministic payloads
- Future end-to-end flows for critical user paths

## Rules

- Contract changes require seam tests.
- Architecture-sensitive refactors must state which layers remain covered and which new tests are needed.
- Placeholder `test` scripts are acceptable only until the subsystem owns real behavior that needs coverage.
