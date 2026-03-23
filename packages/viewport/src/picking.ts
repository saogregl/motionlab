import {
  type AbstractMesh,
  GPUPicker,
  type Observer,
  PointerEventTypes,
  type PointerInfo,
  type Scene,
} from '@babylonjs/core';

import {
  estimateAxisDirection,
  estimateSurfaceType,
  type DatumPreviewType,
} from './rendering/surface-type-estimator.js';
import type { SceneGraphManager } from './scene-graph.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PickResult {
  entityId: string | null;
  mesh: AbstractMesh | null;
}

/** Spatial data computed from a supplemental CPU pick on click. */
export interface SpatialPickData {
  worldPoint: { x: number; y: number; z: number };
  worldNormal: { x: number; y: number; z: number };
  bodyWorldMatrix: Float32Array;
  faceIndex?: number;
}

export type InteractionMode = 'select' | 'create-datum' | 'create-joint' | 'create-load';

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
// Constants
// ---------------------------------------------------------------------------

/** Screen-pixel drag threshold to distinguish click from orbit/pan. */
const DRAG_THRESHOLD_PX = 5;

// ---------------------------------------------------------------------------
// PickingManager
// ---------------------------------------------------------------------------

/**
 * Translates Babylon.js pointer events into entity-level pick and hover
 * callbacks. Uses GPU picking (Babylon 8 GPUPicker) with CPU fallback.
 * Hover picks are RAF-gated to avoid flooding GPU readbacks.
 *
 * Uses POINTERDOWN + POINTERTAP (not POINTERPICK) to reliably detect
 * clicks regardless of whether a mesh is hit, and to distinguish clicks
 * from orbit/pan drags.
 */
export class PickingManager {
  private readonly scene: Scene;
  private readonly sceneGraph: SceneGraphManager;
  private readonly onPick: PickCallback;
  private readonly onHover: HoverCallback;
  private readonly observer: Observer<PointerInfo>;
  private lastHoveredId: string | null = null;
  private hoverPending = false;
  private interactionMode: InteractionMode = 'select';
  private hoveredFace: { bodyId: string; faceIndex: number; previewType?: DatumPreviewType } | null = null;

  private gpuPicker: GPUPicker | null = null;
  private fallbackToCpu = false;
  private pickListDirty = true;

  /** Optional callback when the hovered face changes during create-datum mode. */
  onFaceHoverChange?: FaceHoverCallback;

  // Drag-distance tracking to distinguish click from orbit
  private pointerDownX = 0;
  private pointerDownY = 0;

  constructor(
    scene: Scene,
    sceneGraph: SceneGraphManager,
    onPick: PickCallback,
    onHover: HoverCallback,
  ) {
    this.scene = scene;
    this.sceneGraph = sceneGraph;
    this.onPick = onPick;
    this.onHover = onHover;

    // Initialize GPU picker
    try {
      this.gpuPicker = new GPUPicker();
    } catch {
      this.fallbackToCpu = true;
    }

    // Listen for entity list changes to invalidate GPU picker cache
    this.sceneGraph.onEntityListChanged = () => {
      this.pickListDirty = true;
    };

    this.observer = this.scene.onPointerObservable.add((info) => {
      this.handlePointer(info);
    });
  }

  private updatePickingList(): void {
    if (!this.gpuPicker || this.fallbackToCpu || !this.pickListDirty) return;
    const meshes = this.sceneGraph.getAllPickableMeshes();
    if (meshes.length > 0) {
      this.gpuPicker.setPickingList(meshes);
    }
    this.pickListDirty = false;
  }

  setInteractionMode(mode: InteractionMode): void {
    if (this.interactionMode === mode) return;
    this.interactionMode = mode;
    this.hoveredFace = null;
    this.lastHoveredId = null;
    this.sceneGraph.clearAllFaceHighlights();
    this.sceneGraph.clearDatumPreview();
  }

  getHoveredFace(): { bodyId: string; faceIndex: number } | null {
    return this.hoveredFace;
  }

  private handlePointer(info: PointerInfo): void {
    switch (info.type) {
      case PointerEventTypes.POINTERDOWN: {
        // Record start position for drag-distance threshold
        const evt = info.event as PointerEvent;
        this.pointerDownX = evt.clientX;
        this.pointerDownY = evt.clientY;
        break;
      }

      case PointerEventTypes.POINTERTAP: {
        // POINTERTAP fires on completed click (pointer down + up without
        // significant movement), regardless of whether a mesh was hit.
        const evt = info.event as PointerEvent;

        // Verify this was a true click, not an orbit drag release.
        // POINTERTAP already has its own threshold, but we enforce a
        // stricter one to avoid accidental selection during slow orbits.
        const dx = evt.clientX - this.pointerDownX;
        const dy = evt.clientY - this.pointerDownY;
        if (dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
          break;
        }

        // Perform our own pick at the tap coordinates
        this.pickEntityAtAsync().then((result) => {
          const spatial = result.mesh
            ? this.pickSpatialData(result.mesh, result.entityId)
            : undefined;
          this.onPick(
            result.entityId,
            { ctrl: evt.ctrlKey || evt.metaKey, shift: evt.shiftKey },
            spatial,
          );
        });
        break;
      }

      case PointerEventTypes.POINTERMOVE: {
        // RAF-gated hover throttling — one pick per frame max
        if (!this.hoverPending) {
          this.hoverPending = true;
          requestAnimationFrame(() => {
            this.hoverPending = false;
            this.pickEntityAtAsync().then((result) => {
              if (this.interactionMode === 'create-datum') {
                const hasFace = this.updateHoveredFace(result);
                const nextHoveredId = hasFace ? null : result.entityId;
                if (nextHoveredId !== this.lastHoveredId) {
                  this.lastHoveredId = nextHoveredId;
                  this.onHover(nextHoveredId);
                }
                return;
              }

              this.sceneGraph.clearAllFaceHighlights();
              this.hoveredFace = null;
              if (result.entityId !== this.lastHoveredId) {
                this.lastHoveredId = result.entityId;
                this.onHover(result.entityId);
              }
            });
          });
        }
        break;
      }
    }
  }

  private async pickEntityAtAsync(): Promise<PickResult> {
    if (this.interactionMode === 'create-datum') {
      return this.pickEntityAtCpu();
    }

    // GPU picking path
    if (this.gpuPicker && !this.fallbackToCpu) {
      try {
        this.updatePickingList();

        // Skip GPU pick if one is already in progress (for hover only;
        // this path returns null which is acceptable for hover since the
        // next frame will try again).
        if (this.gpuPicker.pickingInProgress) {
          return this.pickEntityAtCpu();
        }

        const pickingInfo = await this.gpuPicker.pickAsync(
          this.scene.pointerX,
          this.scene.pointerY,
        );

        if (pickingInfo?.mesh) {
          const entityId = this.resolveEntityId(pickingInfo.mesh);
          return { entityId, mesh: pickingInfo.mesh };
        }

        return { entityId: null, mesh: null };
      } catch {
        // GPU picking failed — fall back to CPU for this session
        this.fallbackToCpu = true;
      }
    }

    // CPU fallback
    return this.pickEntityAtCpu();
  }

  private pickEntityAtCpu(): PickResult {
    const pickResult = this.scene.pick(this.scene.pointerX, this.scene.pointerY);

    if (pickResult?.hit && pickResult.pickedMesh) {
      const entityId = this.resolveEntityId(pickResult.pickedMesh);
      return { entityId, mesh: pickResult.pickedMesh };
    }

    // Fallback: multiPick to catch near-edge misses where the primary ray
    // passes through edge-rendered pixels but misses the triangulated surface
    const multiResults = this.scene.multiPick(this.scene.pointerX, this.scene.pointerY);
    if (multiResults?.length) {
      for (const r of multiResults) {
        if (r.hit && r.pickedMesh) {
          const entityId = this.resolveEntityId(r.pickedMesh);
          if (entityId) return { entityId, mesh: r.pickedMesh };
        }
      }
    }

    return { entityId: null, mesh: null };
  }

  private updateHoveredFace(result: PickResult): boolean {
    if (!result.mesh || !result.entityId) {
      this.sceneGraph.clearAllFaceHighlights();
      this.sceneGraph.clearDatumPreview();
      if (this.hoveredFace) {
        this.hoveredFace = null;
        this.onFaceHoverChange?.(null);
      }
      return false;
    }

    const spatial = this.pickSpatialData(result.mesh, result.entityId);
    if (spatial?.faceIndex === undefined) {
      this.sceneGraph.clearAllFaceHighlights();
      this.sceneGraph.clearDatumPreview();
      if (this.hoveredFace) {
        this.hoveredFace = null;
        this.onFaceHoverChange?.(null);
      }
      return false;
    }

    this.sceneGraph.highlightFace(result.entityId, spatial.faceIndex);

    // Compute preview type from face normals and drive the preview overlay
    let previewType: DatumPreviewType | undefined;
    const geometryIndex = this.sceneGraph.getBodyGeometryIndex(result.entityId);
    if (geometryIndex) {
      const faceRange = geometryIndex.faceRanges[spatial.faceIndex];
      if (faceRange) {
        const normals = this.sceneGraph.getBodyMeshNormals(result.entityId);
        const indices = this.sceneGraph.getBodyMeshIndices(result.entityId);
        if (normals && indices) {
          previewType = estimateSurfaceType(normals, indices, faceRange);
          let direction: [number, number, number] = [
            spatial.worldNormal.x,
            spatial.worldNormal.y,
            spatial.worldNormal.z,
          ];
          if (previewType === 'axis') {
            const axisDir = estimateAxisDirection(normals, indices, faceRange);
            if (axisDir) direction = axisDir;
          }
          this.sceneGraph.showDatumPreview({
            type: previewType,
            position: [spatial.worldPoint.x, spatial.worldPoint.y, spatial.worldPoint.z],
            direction,
            bodyId: result.entityId,
          });
        }
      }
    }

    const newFace = { bodyId: result.entityId, faceIndex: spatial.faceIndex, previewType };
    if (!this.hoveredFace || this.hoveredFace.bodyId !== newFace.bodyId || this.hoveredFace.faceIndex !== newFace.faceIndex) {
      this.hoveredFace = newFace;
      this.onFaceHoverChange?.(newFace);
    }
    return true;
  }

  private resolveEntityId(mesh: AbstractMesh): string | null {
    // Fast path: direct metadata
    if (mesh.metadata?.entityId) {
      return mesh.metadata.entityId as string;
    }

    // Fallback: walk parent chain
    let current = mesh.parent;
    while (current) {
      if ((current as AbstractMesh).metadata?.entityId) {
        return (current as AbstractMesh).metadata.entityId as string;
      }
      current = current.parent;
    }

    return null;
  }

  /**
   * Supplemental CPU pick restricted to a single mesh to retrieve world-space
   * hit point, surface normal, and the owning body's world matrix.
   * Cheap because the predicate limits the pick to one mesh.
   */
  private pickSpatialData(
    mesh: AbstractMesh,
    entityId: string | null,
  ): SpatialPickData | undefined {
    const cpuResult = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (m) => m === mesh);

    if (!cpuResult?.hit || !cpuResult.pickedPoint) return undefined;

    const normal = cpuResult.getNormal(true); // world-space normal
    if (!normal) return undefined;

    const bodyRoot = this.resolveBodyRootNode(mesh);
    if (!bodyRoot) return undefined;

    let faceIndex: number | undefined;
    if (entityId && cpuResult.faceId !== undefined && cpuResult.faceId >= 0) {
      const geometryIndex = this.sceneGraph.getBodyGeometryIndex(entityId);
      if (geometryIndex) {
        const resolvedFace = geometryIndex.getFaceFromTriangle(cpuResult.faceId);
        if (resolvedFace >= 0) {
          faceIndex = resolvedFace;
        }
      }
    }

    return {
      worldPoint: {
        x: cpuResult.pickedPoint.x,
        y: cpuResult.pickedPoint.y,
        z: cpuResult.pickedPoint.z,
      },
      worldNormal: { x: normal.x, y: normal.y, z: normal.z },
      bodyWorldMatrix: bodyRoot.getWorldMatrix().toArray() as unknown as Float32Array,
      faceIndex,
    };
  }

  /**
   * Walks the parent chain from `mesh` to find the node tagged with
   * `metadata.entityType === 'body'` and returns it.
   */
  private resolveBodyRootNode(mesh: AbstractMesh): AbstractMesh | null {
    // Check mesh itself
    if (mesh.metadata?.entityType === 'body' && mesh.metadata?.entityId) {
      return mesh;
    }
    let current = mesh.parent;
    while (current) {
      const meta = (current as AbstractMesh).metadata;
      if (meta?.entityType === 'body' && meta?.entityId) {
        return current as AbstractMesh;
      }
      current = current.parent;
    }
    return null;
  }

  dispose(): void {
    this.sceneGraph.clearAllFaceHighlights();
    this.sceneGraph.onEntityListChanged = undefined;
    this.scene.onPointerObservable.remove(this.observer);
    this.gpuPicker?.dispose();
  }
}
