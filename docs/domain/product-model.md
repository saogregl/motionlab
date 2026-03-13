# Product Model

This document names the durable product-facing artifacts the repo is converging toward.

## Core Artifacts

- `ProductDefinition`
- `ModelDefinition`
- `ScenarioDefinition`
- `SimulationRunManifest`

## Design Intent

- Product artifacts are durable, versionable, and backend-agnostic.
- Authored state is distinct from derived runtime outputs.
- Imported geometry, authored mechanism entities, and simulation runs are separate but linked asset families.
