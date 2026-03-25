import { Color } from 'three';

// ── Axis colors (datum triads, spherical DOF rings) ──
export const AXIS_X = new Color(1, 0.2, 0.2);
export const AXIS_Y = new Color(0.2, 0.85, 0.2);
export const AXIS_Z = new Color(0.3, 0.5, 1);

// ── Axis indicator UI (corner widget — intentionally vibrant, distinct from triads) ──
export const AXIS_INDICATOR_X = new Color(1.0, 0.125, 0.375); // #ff2060
export const AXIS_INDICATOR_Y = new Color(0.125, 0.875, 0.5); // #20df80
export const AXIS_INDICATOR_Z = new Color(0.125, 0.5, 1.0); // #2080ff

// ── Joint type colors (joint visuals + DOF indicators) ──
export const JOINT_REVOLUTE = new Color(1, 0.55, 0); // orange
export const JOINT_PRISMATIC = new Color(0, 0.81, 0.82); // cyan
export const JOINT_FIXED = new Color(0.5, 0.5, 0.5); // gray
export const JOINT_SPHERICAL = new Color(0.7, 0.2, 0.9); // purple
export const JOINT_PLANAR = new Color(0.2, 0.8, 0.5); // green/teal

// ── Selection / UI ──
export const ACCENT = new Color(0.06, 0.38, 0.996); // #0f62fe
export const SELECTION_EDGE = { color: new Color(0.06, 0.38, 0.996), alpha: 1.0 };
export const HOVER_EDGE = { color: new Color(0.06, 0.38, 0.996), alpha: 0.6 };
export const DEFAULT_EDGE = { color: new Color(0.15, 0.15, 0.2), alpha: 0.3 };
export const SELECTION_HIGHLIGHT = new Color(0.06, 0.38, 0.996);
export const HOVER_HIGHLIGHT = new Color(0.06, 0.38, 0.996);

// ── Force / torque arrows ──
export const FORCE_ARROW = new Color(0.9, 0.15, 0.15); // crimson
export const TORQUE_ARROW = new Color(0.15, 0.35, 0.9); // blue

// ── Entity type selection colors (Epic 11, ADR-0014) ──
// Use hex strings (sRGB) — new Color(r, g, b) floats are treated as linear by
// Three.js and would render far too bright for these intended sRGB values.
export const ENTITY_BODY = new Color('#4A90D9'); // steel blue — matches SolidWorks selection tone
export const ENTITY_DATUM = new Color(0.314, 0.784, 0.471); // emerald green
export const ENTITY_JOINT = new Color(1.0, 0.549, 0.0); // dark orange
export const ENTITY_LOAD = new Color(0.863, 0.078, 0.235); // crimson
export const ENTITY_ACTUATOR = new Color(0.576, 0.439, 0.859); // medium purple
export const ENTITY_GROUND = new Color(0.5, 0.5, 0.5); // gray

/** Entity-type → selection/hover color lookup (Epic 11, ADR-0014). */
export const ENTITY_COLORS: Record<string, Color> = {
  body: ENTITY_BODY,
  datum: ENTITY_DATUM,
  joint: ENTITY_JOINT,
  load: ENTITY_LOAD,
  actuator: ENTITY_ACTUATOR,
  ground: ENTITY_GROUND,
};

// ── Additional joint type colors ──
export const JOINT_CYLINDRICAL = new Color(0, 0.81, 0.82); // cyan (same as prismatic)
export const JOINT_UNIVERSAL = new Color(0.6, 0.3, 0.8); // purple variant

// ── Joint anchor (unified steel blue for all types) ──
export const JOINT_STEEL_BLUE = new Color(0.44, 0.59, 0.78); // #708fb7

// ── DOF semantic colors ──
export const DOF_FREE = new Color(0.2, 0.85, 0.3); // green
export const DOF_LOCKED = new Color(0.85, 0.2, 0.2); // red

// ── Load/actuator colors (Epic 16 — future use) ──
export const SPRING_NEUTRAL = new Color(0.29, 0.87, 0.5); // #4ade80 green
export const MOTOR_INDICATOR = new Color(0.96, 0.62, 0.04); // #f59e0b amber

// ── Datum preview (Epic 14) ──
export const PREVIEW_OWNERSHIP_EDGE = { color: new Color(0.8, 0.5, 0.2), alpha: 0.5 };
