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

export type PickCallback = (
  entityId: string | null,
  modifiers: { ctrl: boolean; shift: boolean },
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

  private handlePointer(info: PointerInfo): void {
    switch (info.type) {
      case PointerEventTypes.POINTERPICK: {
        const evt = info.event as PointerEvent;
        this.pickEntityAtAsync().then((result) => {
          this.onPick(result.entityId, {
            ctrl: evt.ctrlKey || evt.metaKey,
            shift: evt.shiftKey,
          });
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
    const pickResult = this.scene.pick(
      this.scene.pointerX,
      this.scene.pointerY,
    );

    if (!pickResult?.hit || !pickResult.pickedMesh) {
      return { entityId: null, mesh: null };
    }

    const entityId = this.resolveEntityId(pickResult.pickedMesh);
    return { entityId, mesh: pickResult.pickedMesh };
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

  dispose(): void {
    this.scene.onPointerObservable.remove(this.observer);
    this.gpuPicker?.dispose();
  }
}
