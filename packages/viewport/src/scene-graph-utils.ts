/**
 * scene-graph-utils.ts
 *
 * Pure helper functions, constants, and module-level scratch objects shared
 * across all viewport sub-managers.  No Three.js scene state is held here —
 * only stateless computations and disposable utilities.
 */

import {
  Box3,
  Color,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  Quaternion,
  Vector3,
} from 'three';
import {
  createFatLine,
  disposeFatLine,
  isFatLine,
  setFatLinePoints,
  type FatLineOptions,
  type Line2,
} from './rendering/fat-line-three.js';
import {
  FORCE_ARROW,
  JOINT_STEEL_BLUE,
  JOINT_TYPE_COLORS,
  SPRING_NEUTRAL,
  TORQUE_ARROW,
} from './rendering/colors-three.js';
import type { BodyMeta, LoadMeta, SceneEntityInternal } from './scene-context.js';

// ── Constants ──────────────────────────────────────────────────────────────

export const DEFAULT_BODY_COLOR = new Color('#8faac8');
export const FACE_HIGHLIGHT_COLOR = new Color('#f59e0b');
export const BLACK = new Color(0, 0, 0);
export const DATUM_COLOR = new Color('#4ade80');
export const LOAD_COLOR = new Color('#f87171');
export const SKIP_AXIS_JOINT_TYPES = new Set(['fixed', 'spherical', 'universal', 'distance']);
export const FOCUS_PADDING = 1.6;
export const MIN_CAMERA_EXTENT = 0.5;
export const EPSILON = 1e-6;
export const BVH_ASYNC_TRI_THRESHOLD = 100_000;
export const BVH_BUILD_OPTIONS = { indirect: true } as Parameters<
  import('three').BufferGeometry['computeBoundsTree']
>[0] & { indirect: true };

// ── Module-level scratch objects (avoid per-frame allocations) ─────────────

export const _anchorYAxis = new Vector3(0, 1, 0);
export const _anchorQuat = new Quaternion();
export const _jointAxisScratch = new Vector3();
export const _datumWorldQuat = new Quaternion();

// ── Color utilities ────────────────────────────────────────────────────────

export function cloneColor(color: Color): Color {
  return new Color(color.r, color.g, color.b);
}

export function getLoadBaseColor(kindTag: LoadMeta['kindTag']): Color {
  switch (kindTag) {
    case 'point-torque':
      return TORQUE_ARROW;
    case 'spring-damper':
      return SPRING_NEUTRAL;
    case 'point-force':
    case 'unknown':
    default:
      return FORCE_ARROW;
  }
}

export function createJointColor(jointType: string): Color {
  const typeColor = JOINT_TYPE_COLORS[jointType];
  return cloneColor(typeColor ?? JOINT_STEEL_BLUE);
}

// ── Load helpers ───────────────────────────────────────────────────────────

export function getLoadKind(
  loadState: { type?: string } | null,
): 'point-force' | 'point-torque' | 'spring-damper' | 'unknown' {
  if (!loadState?.type) return 'unknown';
  if (
    loadState.type === 'point-force' ||
    loadState.type === 'point-torque' ||
    loadState.type === 'spring-damper'
  ) {
    return loadState.type;
  }
  return 'unknown';
}

// ── Three.js Object helpers ────────────────────────────────────────────────

export function setPose(target: Object3D, pose: { position: [number, number, number]; rotation: [number, number, number, number] }): void {
  target.position.set(pose.position[0], pose.position[1], pose.position[2]);
  target.quaternion.set(pose.rotation[0], pose.rotation[1], pose.rotation[2], pose.rotation[3]);
}

export function isMeshStandardMaterial(material: unknown): material is MeshStandardMaterial {
  return material instanceof MeshStandardMaterial;
}

export function applyOpacity(mesh: Mesh, opacity: number): void {
  if (!isMeshStandardMaterial(mesh.material)) return;
  mesh.material.transparent = opacity < 0.999;
  mesh.material.opacity = opacity;
  mesh.material.depthWrite = opacity >= 0.999;
}

export function disposeObject3D(root: Object3D): void {
  root.traverse((obj) => {
    if (isFatLine(obj)) {
      disposeFatLine(obj);
      return;
    }
    if (obj instanceof Mesh) {
      obj.geometry.disposeBoundsTree?.();
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) {
        for (const mat of obj.material) {
          mat.dispose();
        }
      } else {
        obj.material.dispose();
      }
    }
    if (obj instanceof Line) {
      obj.geometry.dispose();
      obj.material.dispose();
    }
  });
}

export function setObjectLayerRecursive(root: Object3D, layer: number): void {
  root.traverse((obj) => {
    obj.layers.set(layer);
  });
}

// ── Fat-line wrappers ──────────────────────────────────────────────────────

export function createLine(
  points: Vector3[],
  color: Color,
  userData: Record<string, unknown>,
): Line2 {
  return createFatLine(points, { color }, userData);
}

export function setLinePoints(line: Line2, points: readonly Vector3[]): void {
  setFatLinePoints(line, points);
}

// ── Body helpers ───────────────────────────────────────────────────────────

export function getBodyEdgeLines(
  entity: SceneEntityInternal & { meta: BodyMeta },
): LineSegments[] {
  const edgeLines: LineSegments[] = [];
  for (const geometry of entity.meta.geometries.values()) {
    if (geometry.edgeLines) {
      edgeLines.push(geometry.edgeLines);
    }
  }
  return edgeLines;
}

// ── Camera helpers ─────────────────────────────────────────────────────────

export function getBoxForRoots(roots: Object3D[]): Box3 {
  const box = new Box3();
  for (const root of roots) {
    root.updateMatrixWorld(true);
    box.expandByObject(root);
  }
  return box;
}

export function setCameraToBox(
  camera: OrthographicCamera,
  box: Box3,
  direction: Vector3,
  canvasAspect: number,
): void {
  if (box.isEmpty()) return;

  const center = new Vector3();
  const size = new Vector3();
  box.getCenter(center);
  box.getSize(size);

  const dir =
    direction.lengthSq() > EPSILON
      ? direction.clone().normalize()
      : new Vector3(1, 1, 1).normalize();

  const maxDim = Math.max(size.x, size.y, size.z, MIN_CAMERA_EXTENT);
  camera.position.copy(center).add(dir.multiplyScalar(maxDim * 2.5));
  camera.lookAt(center);

  const aspect = Math.max(canvasAspect, EPSILON);
  const fitHeight = Math.max(size.y, size.z, size.x / aspect, MIN_CAMERA_EXTENT) * FOCUS_PADDING;
  const fitWidth = fitHeight * aspect;

  camera.top = fitHeight / 2;
  camera.bottom = -fitHeight / 2;
  camera.left = -fitWidth / 2;
  camera.right = fitWidth / 2;
  camera.near = -Math.max(maxDim * 10, 100);
  camera.far = Math.max(maxDim * 10, 100);
  camera.updateProjectionMatrix();
}

// Re-export fat-line utilities needed by sub-managers
export { createFatLine, disposeFatLine, isFatLine, setFatLinePoints };
export type { FatLineOptions };
