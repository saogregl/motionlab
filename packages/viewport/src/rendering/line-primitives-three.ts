/**
 * Reusable line-geometry primitives for technical-drawing-style glyphs.
 *
 * All functions return `Vector3[]` point arrays suitable for `createFatLine()`.
 * Plane convention: Y is the joint axis in glyph-local space.
 * - 'xz' = perpendicular to Y axis (default for rotation arcs)
 * - 'xy' / 'yz' = other orthogonal planes
 */

import { Vector3 } from 'three';

// ── Arc ────────────────────────────────────────────────────────────────────

export type ArcPlane = 'xy' | 'xz' | 'yz';

/**
 * Build points along a circular arc in the given plane.
 * @returns `segments + 1` points from startAngle → endAngle.
 */
export function buildArcPoints(
  radius: number,
  startAngle: number,
  endAngle: number,
  segments: number,
  plane: ArcPlane = 'xz',
): Vector3[] {
  const pts: Vector3[] = [];
  const step = (endAngle - startAngle) / segments;
  for (let i = 0; i <= segments; i++) {
    const a = startAngle + i * step;
    const c = Math.cos(a) * radius;
    const s = Math.sin(a) * radius;
    switch (plane) {
      case 'xy':
        pts.push(new Vector3(c, s, 0));
        break;
      case 'xz':
        pts.push(new Vector3(c, 0, s));
        break;
      case 'yz':
        pts.push(new Vector3(0, c, s));
        break;
    }
  }
  return pts;
}

// ── Circle ─────────────────────────────────────────────────────────────────

/** Closed circle polygon (last point === first point). */
export function buildCirclePoints(
  radius: number,
  segments: number,
  plane: ArcPlane = 'xz',
): Vector3[] {
  const pts = buildArcPoints(radius, 0, Math.PI * 2, segments, plane);
  // Ensure exact closure
  pts[pts.length - 1] = pts[0].clone();
  return pts;
}

// ── Tick mark ──────────────────────────────────────────────────────────────

/** Short radial line from a center point outward. Returns [start, end]. */
export function buildTickMark(
  center: Vector3,
  outward: Vector3,
  length: number,
): [Vector3, Vector3] {
  return [center.clone(), center.clone().addScaledVector(outward, length)];
}

// ── Arrow chevron ──────────────────────────────────────────────────────────

/**
 * Open chevron (V shape) pointing in `direction`.
 * Returns [left, tip, right] — three points forming an open arrowhead.
 */
export function buildArrowChevron(
  tip: Vector3,
  direction: Vector3,
  perpendicular: Vector3,
  size: number,
): Vector3[] {
  const back = tip.clone().addScaledVector(direction, -size);
  return [
    back.clone().addScaledVector(perpendicular, size * 0.5),
    tip.clone(),
    back.clone().addScaledVector(perpendicular, -size * 0.5),
  ];
}

// ── Parallel rails ─────────────────────────────────────────────────────────

/**
 * Two parallel lines flanking an axis.
 * Axis runs along Y; rails offset in X.
 */
export function buildParallelRails(
  halfLength: number,
  separation: number,
): { left: Vector3[]; right: Vector3[] } {
  const h = separation / 2;
  return {
    left: [new Vector3(-h, -halfLength, 0), new Vector3(-h, halfLength, 0)],
    right: [new Vector3(h, -halfLength, 0), new Vector3(h, halfLength, 0)],
  };
}

// ── Cross-ties ─────────────────────────────────────────────────────────────

/**
 * Short perpendicular lines crossing between two rails (like railroad ties).
 * Returns an array of [start, end] pairs.
 */
export function buildCrossties(
  halfLength: number,
  separation: number,
  count: number,
): Array<[Vector3, Vector3]> {
  const h = separation / 2;
  const ties: Array<[Vector3, Vector3]> = [];
  const step = (halfLength * 2) / (count + 1);
  for (let i = 1; i <= count; i++) {
    const y = -halfLength + i * step;
    ties.push([new Vector3(-h, y, 0), new Vector3(h, y, 0)]);
  }
  return ties;
}

// ── Square bracket ─────────────────────────────────────────────────────────

/** Closed square outline in the XZ plane. Returns 5 points (closed). */
export function buildSquare(halfSide: number): Vector3[] {
  const s = halfSide;
  return [
    new Vector3(-s, 0, -s),
    new Vector3(s, 0, -s),
    new Vector3(s, 0, s),
    new Vector3(-s, 0, s),
    new Vector3(-s, 0, -s), // close
  ];
}

// ── Crosshair ──────────────────────────────────────────────────────────────

/** Two perpendicular lines through origin in XZ plane. Returns two pairs. */
export function buildCrosshair(halfLength: number): {
  horizontal: [Vector3, Vector3];
  vertical: [Vector3, Vector3];
} {
  return {
    horizontal: [new Vector3(-halfLength, 0, 0), new Vector3(halfLength, 0, 0)],
    vertical: [new Vector3(0, 0, -halfLength), new Vector3(0, 0, halfLength)],
  };
}

// ── Dashed grid ────────────────────────────────────────────────────────────

/** 2×2 grid lines in XZ plane. Returns 4 line pairs. */
export function buildMiniGrid(halfSize: number): Array<[Vector3, Vector3]> {
  const s = halfSize;
  return [
    // X-parallel
    [new Vector3(-s, 0, -s / 2), new Vector3(s, 0, -s / 2)],
    [new Vector3(-s, 0, s / 2), new Vector3(s, 0, s / 2)],
    // Z-parallel
    [new Vector3(-s / 2, 0, -s), new Vector3(-s / 2, 0, s)],
    [new Vector3(s / 2, 0, -s), new Vector3(s / 2, 0, s)],
  ];
}
