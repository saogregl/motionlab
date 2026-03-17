import {
  type AbstractMesh,
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
 * callbacks. Uses POINTERPICK (not POINTERDOWN) so that camera orbit
 * drags do not trigger selection.
 */
export class PickingManager {
  private readonly scene: Scene;
  private readonly sceneGraph: SceneGraphManager;
  private readonly onPick: PickCallback;
  private readonly onHover: HoverCallback;
  private readonly observer: Observer<PointerInfo>;
  private lastHoveredId: string | null = null;

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

    this.observer = this.scene.onPointerObservable.add((info) => {
      this.handlePointer(info);
    });
  }

  private handlePointer(info: PointerInfo): void {
    switch (info.type) {
      case PointerEventTypes.POINTERPICK: {
        const result = this.pickEntityAt();
        const evt = info.event as PointerEvent;
        this.onPick(result.entityId, {
          ctrl: evt.ctrlKey || evt.metaKey,
          shift: evt.shiftKey,
        });
        break;
      }

      case PointerEventTypes.POINTERMOVE: {
        const result = this.pickEntityAt();
        if (result.entityId !== this.lastHoveredId) {
          this.lastHoveredId = result.entityId;
          this.onHover(result.entityId);
        }
        break;
      }
    }
  }

  private pickEntityAt(): PickResult {
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
  }
}
