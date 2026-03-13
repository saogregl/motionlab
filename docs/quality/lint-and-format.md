# Lint and Format

## Current Tooling

- Biome for JS and TS linting and formatting
- TypeScript `tsc --noEmit` for type-checking
- CMake and CTest for the native baseline
- markdownlint for Markdown structure
- Vale for prose checks
- pre-commit for local hook orchestration

## Guidance

- Keep formatters authoritative for formatting decisions.
- Keep docs and generated inventories part of routine review, not cleanup work.
- Add native formatting and static analysis tooling as native complexity grows.
