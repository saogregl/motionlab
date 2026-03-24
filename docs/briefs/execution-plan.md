# Epics 11-20 — Parallel Execution Plan

> **Created:** 2026-03-22
> **Scope:** 31 prompts across 10 epics, organized into 5 waves
> **Critical path:** 13.1 -> 13.2 -> 15.1 -> 15.2 -> 15.3 (body-geometry split -> joint creation)

## Overview

Each wave is a set of prompts that can execute simultaneously. A wave starts only after all its listed dependencies from prior waves have landed. Prompts within a wave have **zero dependencies on each other**.

> 11.1 is done
> 11.2 is done
> 12.1 is done
> 12.2 is done
> 12.3 is done
> 13.1 is done
> 13.2 is done
> 13.3 is done
> 11.3 is done
> 20.1 is done
> 20.2 is done
> 20.3 is done


---

## Wave 1 — Foundations

No inter-dependencies. All five can start immediately.

| Slot | Prompt | Title | Delivers | Est. Effort |
|------|--------|-------|----------|-------------|
| A | **11.1** | Selection Rendering Pipeline | Entity color scheme, HighlightLayer, `SelectionVisuals` API upgrade | Medium |
| B | **12.1** | Command Registry & Action System | `CommandDef` registry, `useCommandsByCategory()`, CommandPalette rewire | Medium |
| C | **13.1** | Body-Geometry Schema & Engine | `Geometry` proto message, `CreateBodyCommand`, `AttachGeometryCommand`, protocol v4, ADR-0013, migration | **Large** |
| D | **19.1** | Visual Hierarchy & Density Overhaul | Token tightening, 24-28px rows, PropertyRow proportional grid, TreeRow density | Medium |
| E | **20.1** | Welcome Screen, Title Bar & Dirty Tracking | `WelcomeScreen`, recent projects, title bar `ProjectName*`, dirty guards, `NewProjectCommand` | Medium |

**Max parallelism:** 5 agents
**Bottleneck:** 13.1 is the largest and gates Wave 3. Start it first if staggering.

---

## Wave 2 — After Wave 1 lands

All Wave 1 blockers must be complete. Within this wave, all 10 prompts are independent.

| Slot | Prompt   | Title                                        | Depends on                                 | Est. Effort |
| ---- | -------- | -------------------------------------------- | ------------------------------------------ | ----------- |
| A    | **11.2** | Selection Logic & Multi-Select               | 11.1 (SelectionVisuals API)                | Medium      |
| B    | **11.3** | Selection Sync & Integration                 | 11.1 (highlight API, entity colors)        | Medium      |
| C    | **12.2** | Main Toolbar Component                       | 12.1 (CommandRegistry, `executeCommand()`) | Medium      |
| D    | **12.3** | Keyboard Shortcuts Manager                   | 12.1 (CommandDef shortcut field, registry) | Small       |
| E    | **13.2** | Frontend Stores & Protocol Wiring            | 13.1 (Geometry proto, new commands)        | Medium      |
| F    | **13.3** | Body & Geometry Inspector UI                 | 13.1 (protocol), 13.2 can be co-developed  | Medium      |
| G    | **19.2** | Status Bar, Connection Chrome & Errors       | 19.1 (density tokens)                      | Medium      |
| H    | **19.3** | Context Menus, Tooltips & Micro-interactions | 19.1 (density tokens)                      | Medium      |
| I    | **20.2** | Auto-Save & Crash Recovery                   | 20.1 (dirty tracking, save infra)          | Medium      |
| J    | **20.3** | Project Templates & Sample Mechanisms        | 20.1 (WelcomeScreen, template card slots)  | Small       |

**Max parallelism:** 10 agents
**Note:** 13.3 benefits from 13.2 landing first (needs `GeometryState` in store), but can start with mock data and integrate later. If strict, treat 13.3 as Wave 2.5 after 13.2.

---

## Wave 3 — Viewport Authoring & Solver

Requires: Epic 11 complete (selection system), 13.2 landed (geometry store), 12.1 landed (commands).

| Slot | Prompt   | Title                                  | Depends on                                                   | Est. Effort |
| ---- | -------- | -------------------------------------- | ------------------------------------------------------------ | ----------- |
| A    | **14.1** | Datum Creation Visual Guides & Preview | 13.2 (geometry entities in store), 11 (selection highlights) | Medium      |
| B    | **15.1** | Viewport Joint Creation Mode           | 13.2 (body/datum model), 11 (selection for datum picking)    | **Large**   |
| C    | **16.1** | Load Creation UI & Force Visualization | 13.2 (mechanism store), 12.1 (create force command)          | Medium      |
| D    | **16.2** | Actuator Creation UI & Motor Vis       | 13.2 (mechanism store), 12.1 (create actuator command)       | Medium      |
| E    | **17.1** | Solver Settings Schema & Engine        | Independent engine work (no frontend deps)                   | Medium      |

**Max parallelism:** 5 agents
**Note:** 17.1 has no dependency on Waves 1-2 and could technically run in Wave 1. It's placed here to manage scope — move it earlier if you have capacity.

---

## Wave 4 — Refinement & Results

Requires respective Wave 3 blockers.

| Slot | Prompt | Title | Depends on | Est. Effort |
|------|--------|-------|------------|-------------|
| A | **14.2** | Edge Topology & Edge-Based Datums | 14.1 (DatumPreviewManager) | **Large** |
| B | **14.3** | Datum Inspector & Coordinate Display | 14.1 (preview system, surface class data) | Small |
| C | **15.2** | DOF Visualization & Constraint Preview | 15.1 (JointCreationState, alignment analysis) | Medium |
| D | **16.3** | Load & Actuator Inspectors + Integration | 16.1 + 16.2 (LoadState, ActuatorState in store) | Medium |
| E | **17.2** | Solver Configuration UI & Presets | 17.1 (SimulationSettings proto) | Medium |
| F | **17.3** | Pre-Simulation Validation & Diagnostics | 17.1 (CompilationDiagnostic message) | Medium |
| G | **18.1** | Interactive Chart & Channel Browser | 17.1 (solver metadata in CompilationResult) | Medium |

**Max parallelism:** 7 agents
**Note:** 14.2 (edge topology) is the largest prompt in this wave — it requires engine-side OCCT edge tessellation, new proto messages, and frontend edge picking. Consider starting it early.

---

## Wave 5 — Final Polish

Requires respective Wave 4 blockers.

| Slot | Prompt | Title | Depends on | Est. Effort |
|------|--------|-------|------------|-------------|
| A | **15.3** | Joint Inspector Enhancement & Coordinates | 15.2 (DOF indicators, coordinate display) | Medium |
| B | **18.2** | Spark-Line Mini-Charts in Inspector | 18.1 (trace store, per-channel stats) | Small |
| C | **18.3** | Results Export & Session History | 18.1 (session run history, trace store) | Medium |
| D | **19.4** | Dark Theme Refinement & Theming Audit | 19.1-3 + ideally all UI epics landed for full audit | Medium |

**Max parallelism:** 4 agents
**Note:** 19.4 (dark theme audit) benefits from running truly last — after all UI components from Epics 11-18 exist. It can start earlier but will need a follow-up pass.

---

## Dependency Graph (ASCII)

```
WAVE 1        11.1    12.1    13.1         19.1    20.1
               │       │       │             │       │
               ├───┐   ├───┐   ├─────┐       ├───┐   ├───┐
WAVE 2        11.2 │  12.2 │  13.2  │      19.2 │  20.2 │
              11.3 │  12.3 │  13.3  │      19.3 │  20.3 │
               │   │       │   │    │           │       │
               └───┤       │   │    │           │       │
WAVE 3        14.1 │  15.1 │  16.1  │      17.1 │
                   │       │  16.2  │       │   │
                   │       │   │    │       │   │
WAVE 4        14.2 │  15.2 │  16.3  │      17.2│  18.1
              14.3 │       │        │      17.3│
                   │   │   │        │          │   │
WAVE 5             │  15.3 │        │      18.2│  18.3
                   │       │        │          │
                   └───────┴────────┴──────────┴── 19.4
```

---

## Summary

| Metric | Value |
|--------|-------|
| Total prompts | 31 |
| Total waves | 5 |
| Max parallelism (single wave) | 10 (Wave 2) |
| Critical path length | 5 waves |
| Critical path | `13.1 -> 13.2 -> 15.1 -> 15.2 -> 15.3` |
| Independent epics (can start anytime) | 17.1 (solver), 19.1 (density), 20.1 (welcome) |
| Largest single prompt | 14.2 (edge topology — engine + proto + frontend) |

## Flexibility Notes

- **17.1** (solver schema) has zero cross-dependencies — it can run in Wave 1 if you have capacity.
- **19.x** (UI polish) prompts are all CSS/component-level with no protocol changes — safe to run alongside anything.
- **20.x** (project management) is mostly Electron-side work — low conflict risk with viewport/protocol epics.
- If 13.1 is delayed, Waves 3-5 slip but Waves 1-2 (selection, toolbar, polish, project mgmt) proceed unaffected.
- 16.1 and 16.2 (loads + actuators) are explicitly parallel within Wave 3 — the protocol commands already exist in the engine.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| 13.1 takes longer than expected (protocol v4 migration) | Blocks all viewport authoring (Waves 3-5) | Start 13.1 first; keep scope tight (no mass visualization yet) |
| 14.2 edge topology requires OCCT API changes | Could delay datum authoring | Make 14.2 a stretch goal; 14.1 (face-only) + 14.3 (inspector) deliver value without it |
| Shortcut conflicts between 12.3 and existing ViewportOverlay | Broken keyboard handling | Run conflict audit before merging 12.3 |
| 19.4 dark theme audit finds issues in components from other epics | Rework across multiple packages | Run 19.4 truly last; accept that it's an audit pass, not a blocker |
