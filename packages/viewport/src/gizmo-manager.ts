import {
  type Observer,
  PositionGizmo,
  RotationGizmo,
  type Scene,
  type TransformNode,
  UtilityLayerRenderer,
} from '@babylonjs/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GizmoMode = 'translate' | 'rotate' | 'off';

export interface GizmoDragEndEvent {
  entityId: string;
  position: [number, number, number];
  rotation: [number, number, number, number]; // quaternion [x, y, z, w]
}

export type GizmoDragEndCallback = (event: GizmoDragEndEvent) => void;

// ---------------------------------------------------------------------------
// DatumGizmoManager
// ---------------------------------------------------------------------------

/**
 * Manages Babylon.js built-in PositionGizmo and RotationGizmo for datum
 * transform editing. Gizmos render on a UtilityLayerRenderer so they don't
 * interfere with main-scene picking or camera controls.
 */
export class DatumGizmoManager {
  private readonly scene: Scene;
  private readonly utilityLayer: UtilityLayerRenderer;
  private readonly positionGizmo: PositionGizmo;
  private readonly rotationGizmo: RotationGizmo;
  // biome-ignore lint: observer types vary across gizmo APIs
  private readonly positionDragEndObserver: Observer<any>;
  // biome-ignore lint: observer types vary across gizmo APIs
  private readonly rotationDragEndObserver: Observer<any>;

  private mode: GizmoMode = 'off';
  private attachedEntityId: string | null = null;
  private attachedNode: TransformNode | null = null;
  private onDragEnd: GizmoDragEndCallback | undefined;

  constructor(scene: Scene) {
    this.scene = scene;
    this.utilityLayer = new UtilityLayerRenderer(scene);

    // Position gizmo
    this.positionGizmo = new PositionGizmo(this.utilityLayer);
    this.positionGizmo.updateGizmoRotationToMatchAttachedMesh = true;
    this.positionGizmo.scaleRatio = 1.2;

    // Rotation gizmo
    this.rotationGizmo = new RotationGizmo(this.utilityLayer);
    this.rotationGizmo.updateGizmoRotationToMatchAttachedMesh = true;
    this.rotationGizmo.scaleRatio = 1.2;

    // Both start detached
    this.positionGizmo.attachedNode = null;
    this.rotationGizmo.attachedNode = null;

    // Listen for drag end on both gizmos to persist the new pose
    this.positionDragEndObserver = this.positionGizmo.onDragEndObservable.add(() => {
      this.emitDragEnd();
    });

    this.rotationDragEndObserver = this.rotationGizmo.onDragEndObservable.add(() => {
      this.emitDragEnd();
    });
  }

  setOnDragEnd(callback: GizmoDragEndCallback | undefined): void {
    this.onDragEnd = callback;
  }

  setMode(mode: GizmoMode): void {
    this.mode = mode;
    this.syncGizmoVisibility();
  }

  getMode(): GizmoMode {
    return this.mode;
  }

  /**
   * Attach the gizmo to a datum entity's transform node.
   * The node must be the datum's rootNode from SceneGraphManager.
   */
  attachTo(entityId: string, node: TransformNode): void {
    this.attachedEntityId = entityId;
    this.attachedNode = node;
    this.syncGizmoVisibility();
  }

  detach(): void {
    this.attachedEntityId = null;
    this.attachedNode = null;
    this.positionGizmo.attachedNode = null;
    this.rotationGizmo.attachedNode = null;
  }

  getAttachedEntityId(): string | null {
    return this.attachedEntityId;
  }

  private syncGizmoVisibility(): void {
    if (this.mode === 'translate' && this.attachedNode) {
      this.positionGizmo.attachedNode = this.attachedNode;
      this.rotationGizmo.attachedNode = null;
    } else if (this.mode === 'rotate' && this.attachedNode) {
      this.positionGizmo.attachedNode = null;
      this.rotationGizmo.attachedNode = this.attachedNode;
    } else {
      this.positionGizmo.attachedNode = null;
      this.rotationGizmo.attachedNode = null;
    }
  }

  private emitDragEnd(): void {
    if (!this.attachedEntityId || !this.attachedNode || !this.onDragEnd) return;

    const pos = this.attachedNode.position;
    const rot = this.attachedNode.rotationQuaternion;

    this.onDragEnd({
      entityId: this.attachedEntityId,
      position: [pos.x, pos.y, pos.z],
      rotation: rot ? [rot.x, rot.y, rot.z, rot.w] : [0, 0, 0, 1],
    });
  }

  dispose(): void {
    this.positionGizmo.onDragEndObservable.remove(this.positionDragEndObserver);
    this.rotationGizmo.onDragEndObservable.remove(this.rotationDragEndObserver);
    this.positionGizmo.dispose();
    this.rotationGizmo.dispose();
    this.utilityLayer.dispose();
  }
}
