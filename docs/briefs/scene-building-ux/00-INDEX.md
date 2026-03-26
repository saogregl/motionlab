# MotionLab — Specification Index

> **Product sentence:** Import CAD geometry, create bodies and datums, then author simulation behavior through direct viewport interaction.

## Documents

| # | Document | Purpose |
|---|----------|---------|
| 01 | ARCHITECTURE | North star: layers, entity model, UI layout, workflows, design principles |
| 02 | ENTITY-MODEL | Six typed entities, their fields, relationships, and planned extensions |
| 03 | UX-FLOWS | Step-by-step user interactions for all major workflows |
| 04 | AGENT-GUIDE | Guidance for coding agents: module boundaries, build order, anti-patterns |
| 05 | GLOSSARY | Terminology, UI language rules, the seven questions |

## Key Design Decisions

1. **Typed entities, not general-purpose ECS.** Six entity types with fixed proto schemas. Lightweight data organization through shared inspector sections, not a component bag.
2. **Datum-centric connections.** Joints connect datum-to-datum. Loads attach to datums. Datums are reference frames placed on body surfaces via face-clicking.
3. **Body/Geometry separation.** Bodies own physics (mass, is_fixed). Geometries own visuals (mesh, asset reference). Independent lifecycle, many-to-one relationship (ADR-0013).
4. **Progressive disclosure.** Start with auto-computed defaults (mass from CAD, density-based). Let users refine later with overrides, manual values, collision shapes.
5. **Engine-authoritative.** All mutations flow through protocol commands to the native engine. The frontend is a projection of engine state.
6. **Direct manipulation.** Viewport is primary workspace. Datum and joint creation happen by clicking geometry faces, not by filling forms.
7. **No import wizard.** Import is a single action. Configuration and refinement happen in-scene, progressively.

## Reading Order for Agents

1. **01-ARCHITECTURE** — understand the mental model and tech stack
2. **05-GLOSSARY** — internalize the terminology
3. **02-ENTITY-MODEL** — understand the six entity types and their relationships
4. **03-UX-FLOWS** — understand what the user sees
5. **04-AGENT-GUIDE** — understand how to approach building it
