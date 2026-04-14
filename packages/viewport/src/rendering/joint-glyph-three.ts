/**
 * Technical-drawing-style joint glyphs built from fat lines (Line2).
 *
 * Replaces the former mesh-based joint-anchor-three.ts and dof-indicators-three.ts.
 * Each glyph is a composition of constant-pixel-width lines: arcs, axis lines,
 * tick marks, chevrons, and node circles.  All joints share a steel-blue color
 * palette and are differentiated by shape, not color.
 *
 * Glyph local convention: Y axis = joint axis (rotation axis for revolute,
 * slide axis for prismatic).  The scene-graph aligns Y to the parent datum Z.
 */

import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

import { AXIS_X, AXIS_Y, AXIS_Z, JOINT_STEEL_BLUE } from './colors-three.js';
import { trackMaterial, untrackMaterial } from './fat-line-three.js';
import {
  buildArcPoints,
  buildArrowChevron,
  buildCirclePoints,
  buildCrosshair,
  buildCrossties,
  buildMiniGrid,
  buildParallelRails,
  buildSquare,
  buildTickMark,
} from './line-primitives-three.js';
import { createSDFLine, disposeSDFLine } from './sdf-line-three.js';

// ── Re-exported DOF table ──────────────────────────────────────────────────

export interface DofSpec {
  rotational: number;
  translational: number;
  total: number;
  label: string;
}

export const DOF_TABLE: Record<string, DofSpec> = {
  revolute: { rotational: 1, translational: 0, total: 1, label: '1R' },
  prismatic: { rotational: 0, translational: 1, total: 1, label: '1T' },
  fixed: { rotational: 0, translational: 0, total: 0, label: '0' },
  spherical: { rotational: 3, translational: 0, total: 3, label: '3R' },
  cylindrical: { rotational: 1, translational: 1, total: 2, label: '1R+1T' },
  planar: { rotational: 1, translational: 2, total: 3, label: '1R+2T' },
  universal: { rotational: 2, translational: 0, total: 2, label: '2R' },
  distance: { rotational: 0, translational: 0, total: 5, label: '5' },
  'point-line': { rotational: 0, translational: 0, total: 4, label: '4' },
  'point-plane': { rotational: 0, translational: 0, total: 3, label: '3' },
};

// ── Result interface ───────────────────────────────────────────────────────

export type GlyphMode = 'idle' | 'hover' | 'selected';

export interface JointGlyphResult {
  rootNode: Group;
  /** All Line2 objects in the glyph (for picking / traversal). */
  lines: Line2[];
  /** SDF billboarded quad meshes (animated dashed lines). */
  sdfMeshes: Mesh[];
  /** Mini XYZ triad lines (kept from the old system for compatibility). */
  triadLines: Line[];
  /** Switch visual mode. */
  setMode(mode: GlyphMode): void;
  /** Override base color (e.g. on selection with entity-type color). */
  setColor(color: Color): void;
  /** Override global opacity multiplier. */
  setOpacity(opacity: number): void;
  /** Advance hover dash-crawl animation. */
  updateAnimation(time: number): void;
  /** Whether the glyph needs per-frame animation updates. */
  isAnimating(): boolean;
  dispose(): void;
}

// ── Constants ──────────────────────────────────────────────────────────────

const PI = Math.PI;
const TWO_PI = PI * 2;

/** Arc segment density: 1 segment per ~6 degrees. */
const ARC_DENSITY = 60; // segments per full circle

function arcSegments(sweepRadians: number): number {
  return Math.max(8, Math.round((Math.abs(sweepRadians) / TWO_PI) * ARC_DENSITY));
}

// ── Glyph line roles & opacity mapping ─────────────────────────────────────

type LineRole = 'primary' | 'secondary' | 'accent';

interface GlyphLine {
  line: Line2;
  material: LineMaterial;
  role: LineRole;
  /** If true, this line's dashOffset will be animated on hover. */
  animateDash?: boolean;
}

/** SDF billboarded quad line — used for animated dashed lines. */
interface SDFGlyphLine {
  mesh: Mesh;
  role: LineRole;
}

const OPACITY: Record<GlyphMode, Record<LineRole, number>> = {
  idle: { primary: 0.3, secondary: 0.2, accent: 0.25 },
  hover: { primary: 0.7, secondary: 0.5, accent: 0.65 },
  selected: { primary: 1.0, secondary: 0.8, accent: 0.9 },
};

// ── Material helpers (owned, not cached) ───────────────────────────────────

function makeLineMaterial(
  color: Color,
  lineWidth: number,
  opts?: {
    opacity?: number;
    dashed?: boolean;
    dashSize?: number;
    gapSize?: number;
    depthTest?: boolean;
  },
): LineMaterial {
  const mat = new LineMaterial({
    color: color.getHex(),
    linewidth: lineWidth,
    transparent: true,
    opacity: opts?.opacity ?? 1,
    depthTest: opts?.depthTest ?? false,
    depthWrite: false,
    toneMapped: false,
    dashed: opts?.dashed ?? false,
    dashSize: opts?.dashSize ?? 0.008,
    gapSize: opts?.gapSize ?? 0.004,
    dashScale: 1,
  });
  trackMaterial(mat);
  return mat;
}

function makeLine2(points: Vector3[], material: LineMaterial): Line2 {
  const geo = new LineGeometry();
  const arr = new Float32Array(points.length * 3);
  for (let i = 0; i < points.length; i++) {
    arr[i * 3] = points[i].x;
    arr[i * 3 + 1] = points[i].y;
    arr[i * 3 + 2] = points[i].z;
  }
  geo.setPositions(arr);
  const line = new Line2(geo, material);
  line.computeLineDistances();
  line.frustumCulled = false;
  line.renderOrder = 5;
  return line;
}

// ── Mini triad (XYZ axis lines) ────────────────────────────────────────────

const TRIAD_LENGTH = 0.04;
const TRIAD_Z_LENGTH = 0.055;
const TRIAD_OPACITY = 0.35;

function createMiniTriad(): { group: Group; lines: Line[] } {
  const group = new Group();
  group.name = 'joint_triad';
  group.renderOrder = 6;

  const axes: Array<{ dir: [number, number, number]; color: Color; length: number }> = [
    { dir: [1, 0, 0], color: AXIS_X, length: TRIAD_LENGTH },
    { dir: [0, 1, 0], color: AXIS_Y, length: TRIAD_LENGTH },
    { dir: [0, 0, 1], color: AXIS_Z, length: TRIAD_Z_LENGTH },
  ];

  const lines: Line[] = [];
  for (const { dir, color, length } of axes) {
    const geo = new BufferGeometry();
    geo.setAttribute(
      'position',
      new Float32BufferAttribute([0, 0, 0, dir[0] * length, dir[1] * length, dir[2] * length], 3),
    );
    const mat = new LineBasicMaterial({
      color,
      transparent: true,
      opacity: TRIAD_OPACITY,
      depthTest: false,
    });
    const line = new Line(geo, mat);
    line.renderOrder = 6;
    group.add(line);
    lines.push(line);
  }

  return { group, lines };
}

// ── Alignment helper ───────────────────────────────────────────────────────

const _yAxis = new Vector3(0, 1, 0);
const _tempQ = new Quaternion();

function orientToAxis(group: Group, axis: Vector3): void {
  const dir = axis.clone().normalize();
  _tempQ.setFromUnitVectors(_yAxis, dir);
  group.quaternion.copy(_tempQ);
}

// ── Glyph builder class ────────────────────────────────────────────────────

class GlyphBuilder {
  readonly rootNode = new Group();
  readonly glyphLines: GlyphLine[] = [];
  readonly sdfLines: SDFGlyphLine[] = [];
  readonly lines: Line2[] = [];
  readonly triadLines: Line[];

  private _mode: GlyphMode = 'idle';
  private _animating = false;
  private _baseColor = JOINT_STEEL_BLUE.clone();
  private _opacityMultiplier = 1;

  constructor(name: string, includeTriad: boolean) {
    this.rootNode.name = name;

    if (includeTriad) {
      const { group, lines } = createMiniTriad();
      this.rootNode.add(group);
      this.triadLines = lines;
    } else {
      this.triadLines = [];
    }
  }

  /**
   * Add an SDF billboarded quad line (round caps, crisp AA, animated dashes).
   * Use for lines with animateDash — replaces the equivalent addLine call.
   */
  addSDFLine(points: Vector3[], lineWidth: number, role: LineRole): Mesh {
    const mesh = createSDFLine(points, {
      color: this._baseColor,
      lineWidth: lineWidth + 0.5, // slightly thicker than equivalent Line2 for visual parity
      opacity: OPACITY.idle[role],
      dashed: true,
      dashSize: 0.008,
      gapSize: 0.004,
    });
    mesh.renderOrder = 5;
    this.rootNode.add(mesh);
    this.sdfLines.push({ mesh, role });
    return mesh;
  }

  /** Add a solid (or non-animated dashed) Line2 line to the glyph. */
  addLine(
    points: Vector3[],
    lineWidth: number,
    role: LineRole,
    opts?: { dashed?: boolean; animateDash?: boolean },
  ): Line2 {
    const mat = makeLineMaterial(this._baseColor, lineWidth, {
      opacity: OPACITY.idle[role],
      dashed: opts?.dashed,
    });
    const line = makeLine2(points, mat);
    this.rootNode.add(line);
    this.lines.push(line);
    this.glyphLines.push({
      line,
      material: mat,
      role,
      animateDash: opts?.animateDash,
    });
    return line;
  }

  /** Build the result object with mode/color/animation controls. */
  build(): JointGlyphResult {
    const self = this;
    return {
      rootNode: self.rootNode,
      lines: self.lines,
      sdfMeshes: self.sdfLines.map((sl) => sl.mesh),
      triadLines: self.triadLines,

      setMode(mode: GlyphMode) {
        self._mode = mode;
        self._animating = mode === 'hover';

        for (const gl of self.glyphLines) {
          const baseOpacity = OPACITY[mode][gl.role] * self._opacityMultiplier;
          gl.material.opacity = baseOpacity;

          if (gl.animateDash) {
            if (mode === 'hover') {
              gl.material.dashed = true;
              gl.material.dashSize = 0.008;
              gl.material.gapSize = 0.004;
            } else {
              // Idle: faint dashes. Selected: solid.
              gl.material.dashed = mode === 'idle';
              gl.material.dashOffset = 0;
            }
          }
          gl.material.needsUpdate = true;
        }

        // SDF animated dash lines.
        for (const sl of self.sdfLines) {
          const u = (sl.mesh.material as ShaderMaterial).uniforms;
          u.uOpacity.value = OPACITY[mode][sl.role] * self._opacityMultiplier;
          if (mode === 'selected') {
            // Solid when selected — cleaner read at full opacity.
            u.uDashed.value = 0.0;
            u.uDashOffset.value = 0;
          } else {
            u.uDashed.value = 1.0;
            if (mode !== 'hover') u.uDashOffset.value = 0;
          }
        }

        // Triad opacity
        const triadOp = mode === 'selected' ? 0.9 : mode === 'hover' ? 0.6 : 0.35;
        for (const line of self.triadLines) {
          (line.material as LineBasicMaterial).opacity = triadOp * self._opacityMultiplier;
          (line.material as LineBasicMaterial).needsUpdate = true;
        }
      },

      setColor(color: Color) {
        self._baseColor.copy(color);
        for (const gl of self.glyphLines) {
          gl.material.color.copy(color);
          gl.material.needsUpdate = true;
        }
        for (const sl of self.sdfLines) {
          (sl.mesh.material as ShaderMaterial).uniforms.uColor.value.copy(color);
        }
      },

      setOpacity(opacity: number) {
        self._opacityMultiplier = opacity;
        // Re-apply current mode with new multiplier
        this.setMode(self._mode);
      },

      updateAnimation(time: number) {
        if (!self._animating) return;
        for (const gl of self.glyphLines) {
          if (gl.animateDash && gl.material.dashed) {
            gl.material.dashOffset = time * 0.03;
            gl.material.needsUpdate = true;
          }
        }
        for (const sl of self.sdfLines) {
          (sl.mesh.material as ShaderMaterial).uniforms.uDashOffset.value = time * 0.03;
        }
      },

      isAnimating() {
        return self._animating;
      },

      dispose() {
        for (const gl of self.glyphLines) {
          gl.line.geometry.dispose();
          untrackMaterial(gl.material);
          gl.material.dispose();
        }
        for (const sl of self.sdfLines) {
          disposeSDFLine(sl.mesh);
        }
        for (const line of self.triadLines) {
          line.geometry.dispose();
          (line.material as LineBasicMaterial).dispose();
        }
      },
    };
  }
}

// ── Per-type glyph factories ───────────────────────────────────────────────

function buildRevoluteGlyph(alignmentAxis?: Vector3): JointGlyphResult {
  const b = new GlyphBuilder('glyph_revolute', true);

  // Center node circle in XZ plane
  b.addLine(buildCirclePoints(0.004, 12, 'xz'), 1.5, 'secondary');

  // Axis line along Y
  b.addLine([new Vector3(0, -0.04, 0), new Vector3(0, 0.04, 0)], 1.0, 'secondary', {
    dashed: true,
  });

  // 270° arc in XZ plane (gap at +Z → from 45° to 315° = π/4 to 7π/4)
  const arcStart = PI / 4;
  const arcEnd = (7 * PI) / 4;
  const arcR = 0.035;
  const arcPts = buildArcPoints(arcR, arcStart, arcEnd, arcSegments(arcEnd - arcStart), 'xz');
  b.addSDFLine(arcPts, 2.0, 'primary');

  // Single arrowhead at the trailing arc end (rotation direction)
  const endPt = arcPts[arcPts.length - 1];
  const endDir = endPt.clone().normalize();
  // Tangent at end of arc: perpendicular to radial in XZ plane
  const tangent = new Vector3(-endDir.z, 0, endDir.x).normalize();
  const chevron = buildArrowChevron(endPt, tangent, endDir, 0.007);
  b.addLine(chevron, 1.5, 'accent');

  if (alignmentAxis) orientToAxis(b.rootNode, alignmentAxis);
  return b.build();
}

function buildPrismaticGlyph(alignmentAxis?: Vector3): JointGlyphResult {
  const b = new GlyphBuilder('glyph_prismatic', true);

  // Center node circle
  b.addLine(buildCirclePoints(0.004, 12, 'xz'), 1.5, 'secondary');

  // Axis line along Y
  const axisHalf = 0.06;
  b.addSDFLine([new Vector3(0, -axisHalf, 0), new Vector3(0, axisHalf, 0)], 1.5, 'primary');

  // Parallel rails
  const railHalf = 0.05;
  const railSep = 0.012;
  const { left, right } = buildParallelRails(railHalf, railSep);
  b.addLine(left, 1.0, 'primary');
  b.addLine(right, 1.0, 'primary');

  // Cross-ties
  const ties = buildCrossties(railHalf, railSep, 3);
  for (const [a, c] of ties) {
    b.addLine([a, c], 0.8, 'secondary');
  }

  // Single arrow at top end of axis (slide direction)
  const yUp = new Vector3(0, 1, 0);
  const xPerp = new Vector3(1, 0, 0);
  b.addLine(buildArrowChevron(new Vector3(0, axisHalf, 0), yUp, xPerp, 0.007), 1.5, 'accent');

  if (alignmentAxis) orientToAxis(b.rootNode, alignmentAxis);
  return b.build();
}

function buildFixedGlyph(alignmentAxis?: Vector3): JointGlyphResult {
  const b = new GlyphBuilder('glyph_fixed', true);

  // Center node circle
  b.addLine(buildCirclePoints(0.004, 12, 'xz'), 1.5, 'secondary');

  // Crosshair
  const cross = buildCrosshair(0.015);
  b.addLine(cross.horizontal, 1.5, 'primary');
  b.addLine(cross.vertical, 1.5, 'primary');

  // Square bracket
  b.addLine(buildSquare(0.01), 1.0, 'secondary');

  if (alignmentAxis) orientToAxis(b.rootNode, alignmentAxis);
  return b.build();
}

function buildSphericalGlyph(): JointGlyphResult {
  const b = new GlyphBuilder('glyph_spherical', true);

  // Center node circle (slightly larger)
  b.addLine(buildCirclePoints(0.005, 12, 'xz'), 1.5, 'secondary');

  // Three 240° arcs on orthogonal planes
  const arcR = 0.04;
  const sweep = (4 * PI) / 3; // 240°
  const offset = PI / 6; // start at 30° so gap is at the back
  const segs = arcSegments(sweep);

  // XZ plane — animated dash (SDF)
  b.addSDFLine(buildArcPoints(arcR, offset, offset + sweep, segs, 'xz'), 2.0, 'primary');
  // XY plane — short-dash
  const xyArc = b.addLine(buildArcPoints(arcR, offset, offset + sweep, segs, 'xy'), 1.5, 'primary');
  // Apply different dash pattern after creation
  const xyMat = xyArc.material as LineMaterial;
  xyMat.dashed = true;
  xyMat.dashSize = 0.005;
  xyMat.gapSize = 0.003;
  xyMat.needsUpdate = true;

  // YZ plane — long-dash
  const yzArc = b.addLine(buildArcPoints(arcR, offset, offset + sweep, segs, 'yz'), 1.5, 'primary');
  const yzMat = yzArc.material as LineMaterial;
  yzMat.dashed = true;
  yzMat.dashSize = 0.01;
  yzMat.gapSize = 0.005;
  yzMat.needsUpdate = true;

  return b.build();
}

function buildCylindricalGlyph(alignmentAxis?: Vector3): JointGlyphResult {
  const b = new GlyphBuilder('glyph_cylindrical', true);

  // Center node circle
  b.addLine(buildCirclePoints(0.004, 12, 'xz'), 1.5, 'secondary');

  // Rotation: 270° arc in XZ plane (smaller radius)
  const arcR = 0.03;
  const arcStart = PI / 4;
  const arcEnd = (7 * PI) / 4;
  b.addSDFLine(
    buildArcPoints(arcR, arcStart, arcEnd, arcSegments(arcEnd - arcStart), 'xz'),
    2.0,
    'primary',
  );

  // Translation: rails along Y
  const railHalf = 0.045;
  const railSep = 0.01;
  const { left, right } = buildParallelRails(railHalf, railSep);
  b.addLine(left, 1.0, 'primary');
  b.addLine(right, 1.0, 'primary');

  // Single arrow at top rail end
  const yUp = new Vector3(0, 1, 0);
  const xPerp = new Vector3(1, 0, 0);
  b.addLine(buildArrowChevron(new Vector3(0, railHalf, 0), yUp, xPerp, 0.006), 1.5, 'accent');

  if (alignmentAxis) orientToAxis(b.rootNode, alignmentAxis);
  return b.build();
}

function buildUniversalGlyph(alignmentAxis?: Vector3): JointGlyphResult {
  const b = new GlyphBuilder('glyph_universal', true);

  // Center node circle
  b.addLine(buildCirclePoints(0.004, 12, 'xz'), 1.5, 'secondary');

  // Two 240° arcs on perpendicular planes
  const arcR = 0.035;
  const sweep = (4 * PI) / 3;
  const offset = PI / 6;
  const segs = arcSegments(sweep);

  // XZ plane
  const xzPts = buildArcPoints(arcR, offset, offset + sweep, segs, 'xz');
  b.addSDFLine(xzPts, 2.0, 'primary');

  // XY plane (perpendicular)
  const xyPts = buildArcPoints(arcR, offset, offset + sweep, segs, 'xy');
  b.addSDFLine(xyPts, 2.0, 'primary');

  // Tick marks at arc endpoints
  const tickLen = 0.005;
  const xzStart = xzPts[0];
  const xzEnd = xzPts[xzPts.length - 1];
  b.addLine(buildTickMark(xzStart, xzStart.clone().normalize(), tickLen), 1.0, 'accent');
  b.addLine(buildTickMark(xzEnd, xzEnd.clone().normalize(), tickLen), 1.0, 'accent');
  const xyStart = xyPts[0];
  const xyEnd = xyPts[xyPts.length - 1];
  b.addLine(buildTickMark(xyStart, xyStart.clone().normalize(), tickLen), 1.0, 'accent');
  b.addLine(buildTickMark(xyEnd, xyEnd.clone().normalize(), tickLen), 1.0, 'accent');

  if (alignmentAxis) orientToAxis(b.rootNode, alignmentAxis);
  return b.build();
}

function buildPlanarGlyph(alignmentAxis?: Vector3): JointGlyphResult {
  const b = new GlyphBuilder('glyph_planar', true);

  // Center node circle
  b.addLine(buildCirclePoints(0.004, 12, 'xz'), 1.5, 'secondary');

  // Rotation: small 270° arc in XZ plane
  const arcR = 0.025;
  const arcStart = PI / 4;
  const arcEnd = (7 * PI) / 4;
  b.addSDFLine(
    buildArcPoints(arcR, arcStart, arcEnd, arcSegments(arcEnd - arcStart), 'xz'),
    1.5,
    'primary',
  );

  // Translation: double-ended arrows along X and Z
  const arrowHalf = 0.04;
  const xDir = new Vector3(1, 0, 0);
  const xNeg = new Vector3(-1, 0, 0);
  const zDir = new Vector3(0, 0, 1);
  const zNeg = new Vector3(0, 0, -1);
  const yPerp = new Vector3(0, 1, 0);
  const xPerp = new Vector3(1, 0, 0);

  // X axis arrows
  b.addLine([new Vector3(-arrowHalf, 0, 0), new Vector3(arrowHalf, 0, 0)], 1.0, 'primary');
  b.addLine(buildArrowChevron(new Vector3(arrowHalf, 0, 0), xDir, yPerp, 0.005), 1.0, 'accent');
  b.addLine(buildArrowChevron(new Vector3(-arrowHalf, 0, 0), xNeg, yPerp, 0.005), 1.0, 'accent');

  // Z axis arrows
  b.addLine([new Vector3(0, 0, -arrowHalf), new Vector3(0, 0, arrowHalf)], 1.0, 'primary');
  b.addLine(buildArrowChevron(new Vector3(0, 0, arrowHalf), zDir, xPerp, 0.005), 1.0, 'accent');
  b.addLine(buildArrowChevron(new Vector3(0, 0, -arrowHalf), zNeg, xPerp, 0.005), 1.0, 'accent');

  // Faint grid in XZ plane
  const gridLines = buildMiniGrid(0.03);
  for (const [a, c] of gridLines) {
    b.addLine([a, c], 0.5, 'secondary', { dashed: true });
  }

  if (alignmentAxis) orientToAxis(b.rootNode, alignmentAxis);
  return b.build();
}

function buildDefaultGlyph(alignmentAxis?: Vector3): JointGlyphResult {
  // Fallback: just a node circle + crosshair
  const b = new GlyphBuilder('glyph_default', true);
  b.addLine(buildCirclePoints(0.006, 12, 'xz'), 1.5, 'primary');
  const cross = buildCrosshair(0.01);
  b.addLine(cross.horizontal, 1.0, 'secondary');
  b.addLine(cross.vertical, 1.0, 'secondary');
  if (alignmentAxis) orientToAxis(b.rootNode, alignmentAxis);
  return b.build();
}

// ── Public factory ─────────────────────────────────────────────────────────

/**
 * Create a technical-drawing-style joint glyph for the given joint type.
 * @param jointType One of: 'revolute', 'prismatic', 'fixed', 'spherical', etc.
 * @param alignmentAxis Optional axis direction to orient the glyph to.
 */
export function createJointGlyph(jointType: string, alignmentAxis?: Vector3): JointGlyphResult {
  switch (jointType) {
    case 'revolute':
      return buildRevoluteGlyph(alignmentAxis);
    case 'prismatic':
      return buildPrismaticGlyph(alignmentAxis);
    case 'fixed':
      return buildFixedGlyph(alignmentAxis);
    case 'spherical':
      return buildSphericalGlyph();
    case 'cylindrical':
      return buildCylindricalGlyph(alignmentAxis);
    case 'universal':
      return buildUniversalGlyph(alignmentAxis);
    case 'planar':
      return buildPlanarGlyph(alignmentAxis);
    default:
      return buildDefaultGlyph(alignmentAxis);
  }
}
