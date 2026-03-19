import {
  type AbstractMesh,
  GPUPicker,
  type Observer,
  PointerEventTypes,
  type PointerInfo,
  type Scene,
} from '@babylonjs/core';

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

export type InteractionMode = 'select' | 'create-datum' | 'create-joint';

export type PickCallback = (
  entityId: string | null,
  modifiers: { ctrl: boolean; shift: boolean },
  spatial?: SpatialPickData,
) => void;

export type HoverCallback = (entityId: string | null) => void;

// ---------------------------------------------------------------------------
// PickingManager
// ---------------------------------------------------------------------------

/**
 * Translates Babylon.js pointer events into entity-level pick and hover
 * callbacks. Uses GPU picking (Babylon 8 GPUPicker) with CPU fallback.
 * Hover picks are RAF-gated to avoid flooding GPU readbacks.
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
  private hoveredFace: { bodyId: string; faceIndex: number } | null = null;

  private gpuPicker: GPUPicker | null = null;
  private fallbackToCpu = false;

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

    this.observer = this.scene.onPointerObservable.add((info) => {
      this.handlePointer(info);
    });
  }

  private updatePickingList(): void {
    if (!this.gpuPicker || this.fallbackToCpu) return;
    const meshes = this.sceneGraph.getAllPickableMeshes();
    if (meshes.length > 0) {
      this.gpuPicker.setPickingList(meshes);
    }
  }

  setInteractionMode(mode: InteractionMode): void {
    if (this.interactionMode === mode) return;
    this.interactionMode = mode;
    this.hoveredFace = null;
    this.lastHoveredId = null;
    this.sceneGraph.clearAllFaceHighlights();
  }

  getHoveredFace(): { bodyId: string; faceIndex: number } | null {
    return this.hoveredFace;
  }

  private handlePointer(info: PointerInfo): void {
    switch (info.type) {
      case PointerEventTypes.POINTERPICK: {
        const evt = info.event as PointerEvent;
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

        if (this.gpuPicker.pickingInProgress) {
          return { entityId: null, mesh: null };
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
      this.hoveredFace = null;
      return false;
    }

    const spatial = this.pickSpatialData(result.mesh, result.entityId);
    if (spatial?.faceIndex === undefined) {
      this.sceneGraph.clearAllFaceHighlights();
      this.hoveredFace = null;
      return false;
    }

    this.sceneGraph.highlightFace(result.entityId, spatial.faceIndex);
    this.hoveredFace = { bodyId: result.entityId, faceIndex: spatial.faceIndex };
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
    this.scene.onPointerObservable.remove(this.observer);
    this.gpuPicker?.dispose();
  }
}
