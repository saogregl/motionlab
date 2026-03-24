# ADR-0015: Simulation Settings Transport Contract

- Status: Accepted
- Date: 2026-03-23
- Decision makers: TBD

## Context

`SimulationSettings` in `transport.proto` carried only `timestep` and `gravity`. Real engineering work requires solver tuning (type, iterations, tolerance), integrator selection, and contact parameter control. Compilation diagnostics were unstructured strings (`repeated string diagnostics`), which blocks entity-linked rendering in the frontend diagnostics panel.

This is a transport-layer contract change under full governance (Epics 5+).

## Decision

1. **SimulationSettings is the transport-level configuration contract — product-facing, not Chrono-facing.** New optional fields: `SolverSettings solver`, `ContactSettings contact`, `double duration`. All fields have backward-compatible defaults when absent.

2. **SimulationConfig is the engine-level IR.** Mapped from proto in the transport layer (`transport_runtime_session.cpp`). Mapped to Chrono API calls in `simulation.cpp` behind the pimpl boundary. Does not include Chrono headers.

3. **Enum values use product-facing names.** `SOLVER_PSOR`, `INTEGRATOR_HHT` — not Chrono class names (`ChSolverPSOR`, `ChTimestepperHHT`). The mapping to Chrono types is confined to `simulation.cpp`.

4. **Default values chosen for broad compatibility, not maximum accuracy.** PSOR solver, 100 iterations, 1e-8 tolerance, Euler implicit linearized integrator. These match effective Chrono defaults for NSC systems.

5. **CompilationDiagnostic is structured.** Fields: `DiagnosticSeverity severity`, `string message`, `repeated string affected_entity_ids`, `string suggestion`, `string code`. The old `repeated string diagnostics` field on `CompilationResultEvent` is deprecated but retained for backward compatibility.

6. **ContactSettings compliance/damping are NSC-specific.** If SMC (Smooth Contact) support is added in a future epic, these fields may need revisiting — likely via a contact-model-specific oneof or a separate `SmcContactSettings` message.

7. **Protocol version remains at 4.** All changes are additive (new fields on existing messages, new enums/messages). Proto3 wire format is backward compatible. Old clients that send only timestep/gravity continue to work unchanged.

## Consequences

- **Positive:** Users can tune solver parameters for stiff or complex mechanisms without modifying engine code.
- **Positive:** Structured diagnostics enable entity-linked UI rendering (Epic 17 Prompt 3).
- **Positive:** Fully backward compatible — absent fields use sensible product defaults.
- **Tradeoff:** `ContactSettings.enable_contact` has a proto3 default of `false`. The transport layer handles this by checking message presence: if `ContactSettings` is absent, contact is enabled (C++ default). If present, the field value is taken as-is.
- **Follow-up:** Prompt 2 builds the settings dialog UI. Prompt 3 populates structured diagnostics from pre-simulation validation.
