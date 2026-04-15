# Epic C3 — Contact Reporting and Visualization

**Mission:** make contacts visible. Surface contact points, normals, and impulses as
viewport overlays and as runtime channels usable in the chart panel and timeline.

**Depends on:** Epic C1 (so users have meaningful materials to tweak in response to
what they see). Independent of C2 — works with primitive collision alone, but is much
more useful once C2 has shipped.

---

## Why

A user authoring collision needs to *see* it work. Today the engine reports nothing —
the user toggles collision on, runs the sim, and either things stack or they don't.
There is no way to know whether contact is being detected, whether friction is doing
what they expect, or where the bad penetrations are.

Contact diagnostics are also the principal way users will reason about whether their
collision shapes are reasonable. The Collision Overlay view mode from C2 shows what
the proxies look like; this epic shows what they're *doing*.

## Current state

- The engine has no `ChContactContainer::ReportContactCallback` registered.
- No `contact/...` channel namespace exists in `useTraceStore`.
- No viewport contact overlay.
- `RuntimeFrame` carries body poses but nothing about contacts.

## Proposed model

### Engine — contact callback

Implement a custom `ChContactContainer::ReportContactCallback` that walks contacts
each step and accumulates per-pair summaries:

```cpp
struct ContactSummary {
  std::string body_a_id;
  std::string body_b_id;
  ChVector3d  point_world;
  ChVector3d  normal_world;     // pointing from B into A
  double      normal_force;
  ChVector3d  tangent_force;
  double      penetration;
};
```

Two output paths:

1. **Per-pair time series** for the chart panel: channels are dynamically registered
   the first time a new pair comes into contact. Channel ids:
   - `contact/<pair_key>/normal_force`        (scalar)
   - `contact/<pair_key>/tangent_force_mag`   (scalar)
   - `contact/<pair_key>/penetration`         (scalar)

   `pair_key` is the two body ids sorted lexicographically and joined with `__`, so
   `(A,B)` and `(B,A)` collapse to one entry.

2. **Per-step contact set** included in `RuntimeFrame` for viewport rendering. This
   is *not* channelized — it's a transient list refreshed every frame, similar to how
   body poses are sent today.

### Channel cardinality cap

A noisy pile of debris could create thousands of pairs. Cap registered pair channels
at 256 most-recently-active and surface a warning in the chart panel header when the
cap is hit. The viewport overlay does not need this cap — it draws what the engine
sends per frame.

### Protocol

Extend `RuntimeFrame` with an optional `repeated ContactPoint contacts` field. Gate
it behind a `contact_reporting_enabled` flag on the runtime session so users with
performance-sensitive scenes can turn it off entirely. Default: on.

```proto
message ContactPoint {
  string body_a_id = 1;
  string body_b_id = 2;
  Vec3 point = 3;
  Vec3 normal = 4;
  double normal_force = 5;
  double tangent_force_mag = 6;
  double penetration = 7;
}

message RuntimeFrame {
  // ... existing fields ...
  repeated ContactPoint contacts = 20;
}
```

### Frontend — viewport overlay

- Small spheres at each contact point.
- One arrow per contact showing the normal force scaled to a unit length, color
  ramped by magnitude (low force = pale, high force = saturated).
- Toggleable via the viewport view-mode pill alongside the Collision Overlay from
  C2. The two overlays are independent and can be enabled together.
- Render path lives in `packages/viewport`, not React (per the non-negotiable rule
  about React not being on the hot path for runtime visualization).

### Frontend — chart panel integration

- Contact channels show up automatically in `useTraceStore` under a `contact/...`
  group.
- The chart panel's channel picker tree gets a new top-level "Contacts" group that
  lists active pairs with their channel set expanded.
- When the cap is hit, a small banner at the top of the Contacts group says "256
  pair limit reached — older pairs evicted" with a link to the docs.

### Pause-on-contact

A simulation setting (lives in `useSimulationSettingsStore`, not in the collision
section): when enabled, the runtime pauses the first time a *new* pair appears.
Useful for diagnosing unexpected interpenetrations in CAD assemblies. Surfaces the
offending pair in a small toast: "Paused on first contact: bodyA ↔ bodyB" with
"Resume" / "Select pair" actions.

---

## Phases

1. **Engine callback + RuntimeFrame contact list**, no UI yet. Validate via debug
   log that contacts arrive at the expected rate and with correct values.
2. **Viewport overlay**. The single most useful deliverable in this epic.
3. **Contact channels** in the chart panel, with the cardinality cap.
4. **Pause-on-contact** simulation setting.

## Acceptance criteria

- [ ] Two colliding bodies produce visible contact markers and normal-force arrows
      in the viewport during simulation.
- [ ] Contact channels appear in the chart panel and plot correctly across a sim
      run.
- [ ] Toggling `contact_reporting_enabled` off restores baseline runtime
      performance (measure and document the delta).
- [ ] Pause-on-contact stops the sim on the first new pair and surfaces which pair
      via a toast.
- [ ] Reset / replay reproduces the same contact frames (replay parity).
- [ ] The 256-pair cap is enforced and surfaces a non-blocking warning.

## Out of scope

- Contact event filtering by material, body type, or collision layer.
- Per-contact impulse history beyond the live frame and the channel time series.
- Audio / haptic feedback on contact.
- Contact-driven scripting or callbacks.
- Contact persistence flags (e.g., "this contact has lasted 0.5 s") — interesting
  but not load-bearing for v1.

## Open questions

- **Replay storage**: contact data is not part of the authored mechanism, so
  replay must record it alongside body poses. Decide whether contact frames live in
  the trace store or in a dedicated contact frame stream. Trace store is the path
  of least resistance but bloats the trace data model with non-channel data.
  Document the decision in an ADR if it affects the trace API.
- **Pair key stability**: two body ids joined with `__` is fine until someone
  renames a body. The id is the UUID, not the name, so renames are safe — but
  document this so future work doesn't accidentally key on names.
- **Force units in the overlay**: arrows scaled to a unit length lose absolute
  magnitude information. Add a small legend in the corner showing the scale ramp
  and the current max-force value.

## File checklist

| Action | File |
|---|---|
| Modify | `schemas/protocol/transport.proto` (RuntimeFrame.contacts, contact_reporting_enabled flag) |
| Modify | `native/engine/src/simulation.cpp` (ContactReporter callback, pair tracking) |
| Modify | `native/engine/src/transport_runtime_session.cpp` (contact frame emission, channel registration) |
| Modify | `packages/viewport/...` (contact overlay renderer, view mode toggle) |
| Modify | `packages/frontend/src/stores/traces.ts` (contact channel namespace handling) |
| Modify | `packages/frontend/src/components/ChartPanel.tsx` (Contacts channel group, cap warning) |
| Modify | `packages/frontend/src/stores/simulation-settings.ts` (pause-on-contact flag) |
| Modify | `packages/frontend/src/components/ViewportToolModeToolbar.tsx` (overlay toggle) |

## Chrono-side risks

- `ChContactContainer::ReportContactCallback` is stable and well-documented. No
  build-side risk.
- Per-step callback overhead is measurable on dense contact scenes (granular
  piles). The `contact_reporting_enabled` flag is the safety valve.
- Pair registration must happen on the engine thread, not the transport thread,
  otherwise channels will race with the trace store.
