# Simulation Model

The simulation model is the product-facing runtime abstraction, not a direct serialization of backend objects.

## Durable Concepts

- authored bodies and datums
- joint relationships between datums
- scenario-level runtime settings
- compiled runtime manifests
- sensor assemblies and output plans
- immutable simulation runs

## Boundary Rule

Backend adapters compile this model into backend-specific runtime objects. The authored model must remain understandable without reading backend code.
