/**
 * Three.js picking / raycasting system.
 *
 * Uses THREE.Raycaster for hit testing against pickable meshes in the scene.
 * Supports four interaction modes: select, create-datum, create-joint, and
 * create-load. In create-datum mode, face-level picking drives surface type
 * estimation and datum preview placement.
 *
 * Pointer event pattern:
 *   POINTERDOWN  -> record start position
 *   POINTERUP    -> if drag distance < 5px, treat as click (pick)
 *   POINTERMOVE  -> RAF-gated hover
 */

import {
  Matrix4,
  Mesh,
  Object3D,
  Raycaster,
  Vector2,
  Vector3,
} from 'three';
import type { Camera, Intersection, Scene, WebGLRenderer } from 'three';

import type { DatumPreviewType } from './rendering/surface-type-estimator.js';
import { VIEWPORT_PICK_LAYER, type SceneGraphManager } from './scene-graph-three.js';

// ---------------------------------------------------------------------------
// Re-exported types (canonical definitions live in R3FViewport.tsx)
// ---------------------------------------------------------------------------

export type InteractionMode = 'select' | 'create-datum' | 'create-joint' | 'create-load';

export interface SpatialPickData {
  worldPoint: { x: number; y: number; z: number };
  worldNormal: { x: number; y: number; z: number };
  bodyWorldMatrix: Float32Array;
  faceIndex?: number;
}

export type PickCallback = (
  entityId: string | null,
  modifiers: { ctrl: boolean; shift: boolean },
  spatial?: SpatialPickData,
) => void;

export type HoverCallback = (entityId: string | null) => void;

export type FaceHoverCallback = (
  face: { bodyId: string; faceIndex: number; previewType?: DatumPreviewType } | null,
) => void;

// ---------------------------------------------------------------------------
// PickResult
// ---------------------------------------------------------------------------

export interface PickResult {
  entityId: string | null;
  mesh: Mesh | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum pointer displacement (px) for a POINTERDOWN+POINTERUP pair to
 *  count as a click rather than a drag. */
const DRAG_THRESHOLD_PX = 5;
const SELECT_HOVER_INTERVAL_MS = 1000 / 30;
const PENDING_BVH_SELECT_HOVER_INTERVAL_MS = 250;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Walk the parent chain of a Three.js object to find the nearest ancestor
 * (or the object itself) whose `userData.entityId` is set.
 */
function resolveEntityId(object: Object3D | null): string | null {
  let cur = object;
  while (cur) {
    if (cur.userData?.entityId) {
      return cur.userData.entityId as string;
    }
    cur = cur.parent;
  }
  return null;
}

/**
 * Find the nearest Mesh in the parent chain (or the object itself).
 */
function resolveEntityMesh(object: Object3D | null): Mesh | null {
  let cur = object;
  while (cur) {
    if (cur instanceof Mesh && cur.userData?.entityId) {
      return cur;
    }
    // Also check children when starting from a Group
    cur = cur.parent;
  }
  return null;
}

/**
 * Convert a PointerEvent's clientX/clientY into normalised device
 * coordinates (-1..+1) relative to the renderer's canvas.
 */
function pointerToNDC(
  event: PointerEvent,
  domElement: HTMLElement,
  out: Vector2,
): Vector2 {
  const rect = domElement.getBoundingClientRect();
  out.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  out.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  return out;
}

/**
 * Transform a face normal from object-local space to world space.
 */
function faceNormalToWorld(
  normal: Vector3,
  objectMatrixWorld: Matrix4,
): Vector3 {
  const normalMatrix = new Matrix4().extractRotation(objectMatrixWorld);
  return normal.clone().applyMatrix4(normalMatrix).normalize();
}

function distanceSquared(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

// ---------------------------------------------------------------------------
// PickingManager
// ---------------------------------------------------------------------------

export class PickingManager {
  private readonly renderer: WebGLRenderer;
  private readonly camera: Camera;
  private readonly scene: Scene;
  private readonly sceneGraph: SceneGraphManager;

  private readonly onPick: PickCallback;
  private readonly onHover: HoverCallback;

  private onFaceHoverChange: FaceHoverCallback | null = null;
  private interactionMode: InteractionMode = 'select';

  // Raycaster state
  private readonly raycaster = new Raycaster();
  private readonly ndcPointer = new Vector2();
  private readonly intersections: Intersection[] = [];

  // Pointer tracking for click detection
  private pointerDownPos: { x: number; y: number } | null = null;
  private pointerDownModifiers: { ctrl: boolean; shift: boolean } = {
    ctrl: false,
    shift: false,
  };

  // RAF-gated hover
  private hoverRafPending = false;
  private hoverRafId: number | null = null;
  private lastHoverEntityId: string | null = null;
  private lastHoverFace: { bodyId: string; faceIndex: number } | null = null;
  private lastPointerPos: { x: number; y: number } | null = null;
  private lastPreciseHoverAt = Number.NEGATIVE_INFINITY;
  private pointerDragSuppressed = false;
  private orbitDragSuppressed = false;
  private transformDragSuppressed = false;

  // Cached pickable mesh list (invalidated via sceneGraph.onEntityListChanged)
  private pickableMeshesCache: Mesh[] | null = null;
  private unsubEntityList: (() => void) | null = null;

  // Bound event handlers (stored for removal in dispose)
  private readonly boundOnPointerDown: (e: PointerEvent) => void;
  private readonly boundOnPointerUp: (e: PointerEvent) => void;
  private readonly boundOnPointerMove: (e: PointerEvent) => void;

  private disposed = false;

  constructor(
    renderer: WebGLRenderer,
    camera: Camera,
    scene: Scene,
    sceneGraph: SceneGraphManager,
    onPick: PickCallback,
    onHover: HoverCallback,
  ) {
    this.renderer = renderer;
    this.camera = camera;
    this.scene = scene;
    this.sceneGraph = sceneGraph;
    this.onPick = onPick;
    this.onHover = onHover;
    this.raycaster.layers.set(VIEWPORT_PICK_LAYER);
    this.raycaster.firstHitOnly = true;

    // Invalidate mesh cache when entities change
    this.unsubEntityList = this.sceneGraph.onEntityListChanged(
      this.invalidateCache.bind(this),
    );

    // Bind handlers
    this.boundOnPointerDown = this.handlePointerDown.bind(this);
    this.boundOnPointerUp = this.handlePointerUp.bind(this);
    this.boundOnPointerMove = this.handlePointerMove.bind(this);

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.boundOnPointerDown);
    el.addEventListener('pointerup', this.boundOnPointerUp);
    el.addEventListener('pointermove', this.boundOnPointerMove);
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  setInteractionMode(mode: InteractionMode): void {
    if (this.interactionMode === mode) return;
    this.interactionMode = mode;

    // Clear face-level state when leaving create-datum mode
    if (mode !== 'create-datum') {
      this.clearFaceHoverState();
      this.sceneGraph.clearAllFaceHighlights();
      this.sceneGraph.clearDatumPreview();
    }
  }

  getInteractionMode(): InteractionMode {
    return this.interactionMode;
  }

  setOnFaceHoverChange(callback: FaceHoverCallback | null): void {
    this.onFaceHoverChange = callback;
  }

  setOrbitDragging(active: boolean): void {
    if (this.orbitDragSuppressed === active) return;
    this.orbitDragSuppressed = active;
    this.syncHoverSuppression();
  }

  setTransformDragging(active: boolean): void {
    if (this.transformDragSuppressed === active) return;
    this.transformDragSuppressed = active;
    this.syncHoverSuppression();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.boundOnPointerDown);
    el.removeEventListener('pointerup', this.boundOnPointerUp);
    el.removeEventListener('pointermove', this.boundOnPointerMove);

    this.clearFaceHoverState();

    // Detach from scene graph
    this.unsubEntityList?.();
    this.unsubEntityList = null;

    if (this.hoverRafId !== null) {
      cancelAnimationFrame(this.hoverRafId);
      this.hoverRafId = null;
    }
  }

  // -----------------------------------------------------------------------
  // Pointer event handlers
  // -----------------------------------------------------------------------

  private handlePointerDown(event: PointerEvent): void {
    this.pointerDownPos = { x: event.clientX, y: event.clientY };
    this.lastPointerPos = { x: event.clientX, y: event.clientY };
    this.pointerDragSuppressed = false;
    this.pointerDownModifiers = {
      ctrl: event.ctrlKey || event.metaKey,
      shift: event.shiftKey,
    };
  }

  private handlePointerUp(event: PointerEvent): void {
    if (!this.pointerDownPos) return;

    this.lastPointerPos = { x: event.clientX, y: event.clientY };
    const distance = Math.sqrt(
      distanceSquared(this.pointerDownPos, this.lastPointerPos),
    );
    const wasPointerDrag = this.pointerDragSuppressed;

    this.pointerDownPos = null;
    this.pointerDragSuppressed = false;
    this.syncHoverSuppression();

    // Only count as a click if the pointer barely moved
    if (distance >= DRAG_THRESHOLD_PX || wasPointerDrag) return;

    const modifiers = {
      ctrl: event.ctrlKey || event.metaKey || this.pointerDownModifiers.ctrl,
      shift: event.shiftKey || this.pointerDownModifiers.shift,
    };

    this.performPick(event, modifiers);
  }

  private handlePointerMove(event: PointerEvent): void {
    this.lastPointerPos = { x: event.clientX, y: event.clientY };

    if (
      this.pointerDownPos &&
      distanceSquared(this.pointerDownPos, this.lastPointerPos) >=
        DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX
    ) {
      this.pointerDragSuppressed = true;
    }

    if (this.isHoverSuppressed()) {
      this.cancelPendingHover();
      return;
    }

    this.scheduleHover();
  }

  // -----------------------------------------------------------------------
  // Core picking logic
  // -----------------------------------------------------------------------

  private getPickableMeshes(): Mesh[] {
    if (!this.pickableMeshesCache) {
      this.pickableMeshesCache = this.sceneGraph.getAllPickableMeshes();
    }
    return this.pickableMeshesCache;
  }

  private invalidateCache(): void {
    this.pickableMeshesCache = null;
  }

  /**
   * Cast a ray and return the first intersection, or null.
   */
  private raycast(event: PointerEvent): Intersection | null {
    pointerToNDC(event, this.renderer.domElement, this.ndcPointer);
    this.raycaster.setFromCamera(this.ndcPointer, this.camera);

    const meshes = this.getPickableMeshes();
    if (meshes.length === 0) return null;

    this.intersections.length = 0;
    this.raycaster.intersectObjects(meshes, false, this.intersections);
    return this.intersections[0] ?? null;
  }

  /**
   * Cast a ray using the already-set ndcPointer (for hover, which uses RAF).
   */
  private raycastFromNDC(): Intersection | null {
    this.raycaster.setFromCamera(this.ndcPointer, this.camera);

    const meshes = this.getPickableMeshes();
    if (meshes.length === 0) return null;

    this.intersections.length = 0;
    this.raycaster.intersectObjects(meshes, false, this.intersections);
    return this.intersections[0] ?? null;
  }

  /**
   * Resolve a raycast intersection into an entity pick result.
   */
  private resolveHit(hit: Intersection): PickResult {
    const entityId = resolveEntityId(hit.object);
    const mesh = hit.object instanceof Mesh ? hit.object : resolveEntityMesh(hit.object);
    return { entityId, mesh };
  }

  // -----------------------------------------------------------------------
  // Pick (click)
  // -----------------------------------------------------------------------

  private performPick(
    event: PointerEvent,
    modifiers: { ctrl: boolean; shift: boolean },
  ): void {
    const hit = this.raycast(event);

    if (!hit) {
      this.onPick(null, modifiers);
      return;
    }

    const { entityId } = this.resolveHit(hit);

    if (
      this.interactionMode === 'create-datum' ||
      this.interactionMode === 'create-joint' ||
      this.interactionMode === 'create-load'
    ) {
      const spatial = this.buildSpatialPickData(hit);
      this.onPick(entityId, modifiers, spatial);
    } else {
      // Select mode only needs entity identity.
      this.onPick(entityId, modifiers);
    }
  }

  /**
   * Build SpatialPickData from a raycast intersection (used in create-datum mode).
   */
  private buildSpatialPickData(hit: Intersection): SpatialPickData | undefined {
    if (!hit.face) return undefined;

    const entityId = resolveEntityId(hit.object);
    if (!entityId) return undefined;

    // World-space hit point
    const worldPoint = {
      x: hit.point.x,
      y: hit.point.y,
      z: hit.point.z,
    };

    // Face normal transformed to world space
    const worldNormal3 = faceNormalToWorld(
      hit.face.normal.clone(),
      hit.object.matrixWorld,
    );
    const worldNormal = {
      x: worldNormal3.x,
      y: worldNormal3.y,
      z: worldNormal3.z,
    };

    // Body world matrix as Float32Array (column-major, 16 elements)
    // Walk up to find the group with entityId (the body root node)
    let bodyObject: Object3D = hit.object;
    while (bodyObject.parent && !bodyObject.userData?.entityId) {
      bodyObject = bodyObject.parent;
    }
    bodyObject.updateMatrixWorld(true);
    const bodyWorldMatrix = new Float32Array(bodyObject.matrixWorld.elements);

    // Triangle index -> face index via geometry index
    let faceIndex: number | undefined;
    const triangleIndex = hit.faceIndex;
    if (triangleIndex !== undefined && triangleIndex !== null) {
      const geoIndex = this.sceneGraph.getBodyGeometryIndex(entityId);
      if (geoIndex) {
        const resolvedFaceIndex = geoIndex.getFaceFromTriangle(triangleIndex);
        faceIndex = resolvedFaceIndex >= 0 ? resolvedFaceIndex : undefined;
      } else {
        // No geometry index available: use raw triangle index as fallback
        faceIndex = triangleIndex;
      }
    }

    return {
      worldPoint,
      worldNormal,
      bodyWorldMatrix,
      faceIndex,
    };
  }

  // -----------------------------------------------------------------------
  // Hover
  // -----------------------------------------------------------------------

  private performHover(): void {
    if (this.isHoverSuppressed()) return;
    const hit = this.raycastFromNDC();

    if (!hit) {
      this.updateEntityHover(null);
      this.updateFaceHover(null, null, null);
      return;
    }

    const { entityId } = this.resolveHit(hit);
    this.updateEntityHover(entityId);

    // Face-level hover only in create-datum mode
    if (this.interactionMode === 'create-datum') {
      this.updateFaceHoverFromHit(hit, entityId);
    } else {
      this.updateFaceHover(null, null, null);
    }
  }

  private updateEntityHover(entityId: string | null): void {
    if (entityId === this.lastHoverEntityId) return;
    this.lastHoverEntityId = entityId;
    this.onHover(entityId);
  }

  /**
   * Face-level hover for create-datum mode. Determines the face index from
   * the triangle hit, estimates surface type, updates highlights and preview.
   */
  private updateFaceHoverFromHit(
    hit: Intersection,
    entityId: string | null,
  ): void {
    if (!entityId || hit.faceIndex === undefined || hit.faceIndex === null) {
      this.updateFaceHover(null, null, null);
      return;
    }

    // Resolve face index via geometry index
    const geoIndex = this.sceneGraph.getBodyGeometryIndex(entityId);
    let faceIndex: number;
    if (geoIndex) {
      faceIndex = geoIndex.getFaceFromTriangle(hit.faceIndex);
      if (faceIndex < 0) {
        this.updateFaceHover(null, null, null);
        return;
      }
    } else {
      // Fallback: raw triangle index
      faceIndex = hit.faceIndex;
    }

    // Check if this is the same face we already reported
    if (
      this.lastHoverFace &&
      this.lastHoverFace.bodyId === entityId &&
      this.lastHoverFace.faceIndex === faceIndex
    ) {
      return;
    }

    // Estimate surface type for this face
    const facePreview = geoIndex
      ? this.sceneGraph.getBodyFacePreview(entityId, faceIndex)
      : null;
    const previewType = facePreview?.previewType;

    if (geoIndex && previewType) {

      // Update face highlight
      this.sceneGraph.clearAllFaceHighlights();
      this.sceneGraph.highlightFace(entityId, faceIndex);

      // Show datum preview
      this.updateDatumPreview(
        hit,
        entityId,
        previewType,
        facePreview.axisDirection,
      );
    }

    this.updateFaceHover(entityId, faceIndex, previewType ?? null);
  }

  /**
   * Compute and display a datum preview at the hover point.
   */
  private updateDatumPreview(
    hit: Intersection,
    bodyId: string,
    previewType: DatumPreviewType,
    axisDirectionLocal: [number, number, number] | null,
  ): void {
    // World-space position
    const position: [number, number, number] = [
      hit.point.x,
      hit.point.y,
      hit.point.z,
    ];

    // Surface normal in world space
    let normal: [number, number, number] = [0, 1, 0];
    if (hit.face) {
      const wn = faceNormalToWorld(
        hit.face.normal.clone(),
        hit.object.matrixWorld,
      );
      normal = [wn.x, wn.y, wn.z];
    }

    // Axis direction (for cylindrical surfaces)
    let axisDir: [number, number, number] | null = null;
    if (previewType === 'axis' && axisDirectionLocal) {
        // Transform axis direction from object-local to world space
        const axisMat = new Matrix4().extractRotation(hit.object.matrixWorld);
        const axisVec = new Vector3(
          axisDirectionLocal[0],
          axisDirectionLocal[1],
          axisDirectionLocal[2],
        );
        axisVec.applyMatrix4(axisMat).normalize();
        axisDir = [axisVec.x, axisVec.y, axisVec.z];
    }

    this.sceneGraph.showDatumPreview({
      bodyId,
      type: previewType,
      position,
      normal,
      axisDirection: axisDir,
    });
  }

  private updateFaceHover(
    bodyId: string | null,
    faceIndex: number | null,
    previewType: DatumPreviewType | null,
  ): void {
    const prev = this.lastHoverFace;
    const next =
      bodyId !== null && faceIndex !== null ? { bodyId, faceIndex } : null;

    // No change
    if (
      prev?.bodyId === next?.bodyId &&
      prev?.faceIndex === next?.faceIndex
    ) {
      return;
    }

    this.lastHoverFace = next;

    // Clear visuals when leaving a face
    if (!next) {
      this.sceneGraph.clearAllFaceHighlights();
      this.sceneGraph.clearDatumPreview();
    }

    // Notify callback
    if (this.onFaceHoverChange) {
      if (next && previewType !== null) {
        this.onFaceHoverChange({
          bodyId: next.bodyId,
          faceIndex: next.faceIndex,
          previewType: previewType ?? undefined,
        });
      } else if (next) {
        this.onFaceHoverChange({
          bodyId: next.bodyId,
          faceIndex: next.faceIndex,
        });
      } else {
        this.onFaceHoverChange(null);
      }
    }
  }

  private clearFaceHoverState(): void {
    this.lastHoverFace = null;
    this.lastHoverEntityId = null;
  }

  private isHoverSuppressed(): boolean {
    return (
      this.pointerDragSuppressed ||
      this.orbitDragSuppressed ||
      this.transformDragSuppressed
    );
  }

  private syncHoverSuppression(): void {
    if (this.isHoverSuppressed()) {
      this.cancelPendingHover();
      return;
    }
    this.scheduleHover();
  }

  private cancelPendingHover(): void {
    this.hoverRafPending = false;
    if (this.hoverRafId !== null) {
      cancelAnimationFrame(this.hoverRafId);
      this.hoverRafId = null;
    }
  }

  private scheduleHover(): void {
    if (this.hoverRafPending || !this.lastPointerPos) return;
    this.hoverRafPending = true;

    const { x: clientX, y: clientY } = this.lastPointerPos;
    const domElement = this.renderer.domElement;

    this.hoverRafId = requestAnimationFrame((timestampMs) => {
      this.hoverRafPending = false;
      this.hoverRafId = null;
      if (this.disposed || this.isHoverSuppressed()) return;

      const hoverInterval = this.getPreciseHoverIntervalMs();
      if (
        this.interactionMode === 'select' &&
        timestampMs - this.lastPreciseHoverAt < hoverInterval
      ) {
        this.scheduleHover();
        return;
      }

      const rect = domElement.getBoundingClientRect();
      this.ndcPointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      this.ndcPointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      this.lastPreciseHoverAt = timestampMs;
      this.performHover();
    });
  }

  private getPreciseHoverIntervalMs(): number {
    if (this.interactionMode !== 'select') {
      return 0;
    }
    return this.sceneGraph.hasPendingBodyBvhs()
      ? PENDING_BVH_SELECT_HOVER_INTERVAL_MS
      : SELECT_HOVER_INTERVAL_MS;
  }
}
