/**
 * Fat-line helpers using Three.js Line2 / LineMaterial.
 *
 * Native WebGL gl.LINE ignores linewidth on most platforms (always 1 px).
 * Line2 renders screen-space-width lines via a triangle-strip shader,
 * giving consistent thickness and built-in anti-aliasing.
 */

import { Color, Vector2, Vector3 } from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

export { Line2, LineGeometry, LineMaterial };

// ── Shared resolution vector ────────────────────────────────────────────────
// Every LineMaterial needs the canvas size for correct screen-space width.
// We store one shared Vector2 and update it from SceneGraphManager.setCanvasSize().

const _sharedResolution = new Vector2(1, 1);

const _trackedMaterials = new Set<LineMaterial>();

export function updateFatLineResolution(width: number, height: number): void {
  _sharedResolution.set(width, height);
  for (const mat of _trackedMaterials) {
    mat.resolution.copy(_sharedResolution);
  }
}

function trackMaterial(mat: LineMaterial): void {
  mat.resolution.copy(_sharedResolution);
  _trackedMaterials.add(mat);
}

export function untrackMaterial(mat: LineMaterial): void {
  _trackedMaterials.delete(mat);
}

// ── Line creation ───────────────────────────────────────────────────────────

/** Default indicator line width in pixels. */
export const INDICATOR_LINE_WIDTH = 2;

function pointsToPositions(points: readonly Vector3[]): Float32Array {
  const arr = new Float32Array(points.length * 3);
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    arr[i * 3] = p.x;
    arr[i * 3 + 1] = p.y;
    arr[i * 3 + 2] = p.z;
  }
  return arr;
}

export interface FatLineOptions {
  color: Color;
  lineWidth?: number;
  transparent?: boolean;
  opacity?: number;
  toneMapped?: boolean;
  depthTest?: boolean;
  dashed?: boolean;
  dashScale?: number;
  dashSize?: number;
  gapSize?: number;
}

// ── Shared material cache (ref-counted) ─────────────────────────────────────
// Lines created for indicators (frame triads, axis lines, joint overlays) share
// identical material params. Caching avoids redundant LineMaterial constructor +
// shader compilation costs on every selection change.

interface CachedMaterial {
  material: LineMaterial;
  refCount: number;
}

const _materialCache = new Map<string, CachedMaterial>();

function materialKey(opts: FatLineOptions): string {
  const lw = opts.lineWidth ?? INDICATOR_LINE_WIDTH;
  const tr = opts.transparent ?? false;
  const op = opts.opacity ?? 1;
  const tm = opts.toneMapped ?? false;
  const dt = opts.depthTest ?? true;
  const da = opts.dashed ?? false;
  const ds = opts.dashScale ?? 1;
  const dz = opts.dashSize ?? 0.02;
  const gs = opts.gapSize ?? 0.01;
  return `${opts.color.getHex()}_${lw}_${tr}_${op}_${tm}_${dt}_${da}_${ds}_${dz}_${gs}`;
}

function acquireMaterial(opts: FatLineOptions): LineMaterial {
  const key = materialKey(opts);
  const cached = _materialCache.get(key);
  if (cached) {
    cached.refCount++;
    return cached.material;
  }
  const material = new LineMaterial({
    color: opts.color.getHex(),
    linewidth: opts.lineWidth ?? INDICATOR_LINE_WIDTH,
    toneMapped: opts.toneMapped ?? false,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    depthTest: opts.depthTest ?? true,
    dashed: opts.dashed ?? false,
    dashScale: opts.dashScale ?? 1,
    dashSize: opts.dashSize ?? 0.02,
    gapSize: opts.gapSize ?? 0.01,
  });
  trackMaterial(material);
  _materialCache.set(key, { material, refCount: 1 });
  return material;
}

function releaseMaterial(mat: LineMaterial): void {
  for (const [key, cached] of _materialCache) {
    if (cached.material === mat) {
      cached.refCount--;
      if (cached.refCount <= 0) {
        _materialCache.delete(key);
        untrackMaterial(mat);
        mat.dispose();
      }
      return;
    }
  }
  // Not in cache — dispose directly (e.g. material created before caching)
  untrackMaterial(mat);
  mat.dispose();
}

export function createFatLine(
  points: readonly Vector3[],
  opts: FatLineOptions,
  userData?: Record<string, unknown>,
): Line2 {
  const geometry = new LineGeometry();
  geometry.setPositions(pointsToPositions(points));

  const material = acquireMaterial(opts);

  const line = new Line2(geometry, material);
  line.computeLineDistances();
  if (userData) line.userData = userData;
  line.frustumCulled = false;

  return line;
}

/** Update positions on an existing Line2. */
export function setFatLinePoints(line: Line2, points: readonly Vector3[]): void {
  const geometry = line.geometry as LineGeometry;
  geometry.setPositions(pointsToPositions(points));
  line.computeLineDistances();
}

/** Dispose a Line2 and release its shared material. */
export function disposeFatLine(line: Line2): void {
  line.geometry.dispose();
  releaseMaterial(line.material as LineMaterial);
}

/** Type guard: is this object a Line2 with a LineMaterial? */
export function isFatLine(obj: unknown): obj is Line2 {
  return obj instanceof Line2;
}
