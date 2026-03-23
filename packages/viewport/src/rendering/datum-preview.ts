/**
 * DatumPreviewManager — transient preview geometry for datum creation.
 *
 * Displays a plane, axis, or point indicator at the face pick location
 * to show the user what type of datum will be created before confirming.
 */

import {
  type AbstractMesh,
  type ArcRotateCamera,
  Color3,
  Color4,
  Mesh,
  type Observer,
  Quaternion,
  type Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';

import type { DatumPreviewType } from './surface-type-estimator.js';
export type { DatumPreviewType } from './surface-type-estimator.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface DatumPreviewConfig {
  type: DatumPreviewType;
  position: [number, number, number];
  direction: [number, number, number]; // Z-axis direction (normal or axis)
  bodyId: string;
}

const DATUM_SCALE_FACTOR = 0.05;
const PREVIEW_COLOR = new Color3(0.4, 0.7, 1.0);
const PREVIEW_OWNERSHIP_EDGE_COLOR = new Color4(0.8, 0.5, 0.2, 0.5);
const PREVIEW_OWNERSHIP_EDGE_WIDTH = 3.5;
const TESSELLATION = 8;
const RENDERING_GROUP = 1;

/** Threshold for detecting "unchanged" config to skip redundant rebuilds. */
const POSITION_EPSILON = 1e-4;
const DIRECTION_EPSILON = 1e-3;

// ---------------------------------------------------------------------------
// Manager
// ---------------------------------------------------------------------------

export class DatumPreviewManager {
  private readonly scene: Scene;
  private readonly camera: ArcRotateCamera;
  private readonly getBodyMesh: (id: string) => AbstractMesh | null;

  private previewRoot: TransformNode | null = null;
  private previewMeshes: AbstractMesh[] = [];
  private scaleObserver: Observer<Scene> | null = null;

  // Cached materials (created lazily)
  private planeMaterial: StandardMaterial | null = null;
  private axisMaterial: StandardMaterial | null = null;
  private pointMaterial: StandardMaterial | null = null;

  // Body ownership tracking
  private currentBodyId: string | null = null;
  private ownershipBodyMesh: AbstractMesh | null = null;
  private savedEdgesColor: Color4 | null = null;
  private savedEdgesWidth = 2.0;

  // Previous config for skip-if-unchanged optimization
  private lastConfig: DatumPreviewConfig | null = null;

  constructor(
    scene: Scene,
    camera: ArcRotateCamera,
    getBodyMesh: (id: string) => AbstractMesh | null,
  ) {
    this.scene = scene;
    this.camera = camera;
    this.getBodyMesh = getBodyMesh;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  show(config: DatumPreviewConfig): void {
    // Skip if config is unchanged
    if (this.lastConfig && this.configUnchanged(this.lastConfig, config)) {
      return;
    }

    // Dispose old preview
    this.disposeMeshes();

    // Create root at the pick position
    const root = new TransformNode('datum_preview_root', this.scene);
    root.position = new Vector3(config.position[0], config.position[1], config.position[2]);
    root.rotationQuaternion = this.orientToDirection(config.direction);
    this.previewRoot = root;

    // Create type-specific geometry
    switch (config.type) {
      case 'plane':
        this.createPlanePreview(root);
        break;
      case 'axis':
        this.createAxisPreview(root);
        break;
      case 'point':
        this.createPointPreview(root);
        break;
    }

    // Apply common properties to all preview meshes
    for (const mesh of this.previewMeshes) {
      mesh.renderingGroupId = RENDERING_GROUP;
      mesh.isPickable = false;
    }

    // Register camera-distance scaling
    this.scaleObserver = this.scene.onBeforeRenderObservable.add(() => {
      if (!this.previewRoot) return;
      const dist = Vector3.Distance(this.camera.position, this.previewRoot.position);
      const scale = dist * DATUM_SCALE_FACTOR;
      this.previewRoot.scaling.setAll(Math.max(scale, 0.001));
    });

    // Body ownership indicator
    this.applyBodyOwnership(config.bodyId);

    this.lastConfig = { ...config };
  }

  clear(): void {
    this.disposeMeshes();
    this.revertBodyOwnership();
    this.lastConfig = null;
  }

  getCurrentBodyId(): string | null {
    return this.currentBodyId;
  }

  dispose(): void {
    this.clear();
    this.planeMaterial?.dispose();
    this.axisMaterial?.dispose();
    this.pointMaterial?.dispose();
    this.planeMaterial = null;
    this.axisMaterial = null;
    this.pointMaterial = null;
  }

  // -----------------------------------------------------------------------
  // Geometry creation
  // -----------------------------------------------------------------------

  private createPlanePreview(root: TransformNode): void {
    const mat = this.getOrCreateMaterial('plane');

    // Semi-transparent plane disc
    const plane = Mesh.CreatePlane('datum_preview_plane', 0.15, this.scene);
    plane.material = mat;
    plane.parent = root;

    // Normal arrow shaft
    const shaft = Mesh.CreateCylinder(
      'datum_preview_shaft',
      0.1,
      0.004,
      0.004,
      TESSELLATION,
      1,
      this.scene,
      false,
    );
    shaft.material = mat;
    shaft.parent = root;
    shaft.position = new Vector3(0, 0.05, 0);

    // Cone head
    const cone = Mesh.CreateCylinder(
      'datum_preview_cone',
      0.025,
      0,
      0.012,
      TESSELLATION,
      1,
      this.scene,
      false,
    );
    cone.material = mat;
    cone.parent = root;
    cone.position = new Vector3(0, 0.1 + 0.025 / 2, 0);

    this.previewMeshes.push(plane, shaft, cone);
  }

  private createAxisPreview(root: TransformNode): void {
    const mat = this.getOrCreateMaterial('axis');

    // Axis line
    const line = Mesh.CreateCylinder(
      'datum_preview_line',
      0.4,
      0.003,
      0.003,
      TESSELLATION,
      1,
      this.scene,
      false,
    );
    line.material = mat;
    line.parent = root;

    // Cone head
    const cone = Mesh.CreateCylinder(
      'datum_preview_cone',
      0.025,
      0,
      0.012,
      TESSELLATION,
      1,
      this.scene,
      false,
    );
    cone.material = mat;
    cone.parent = root;
    cone.position = new Vector3(0, 0.2 + 0.025 / 2, 0);

    this.previewMeshes.push(line, cone);
  }

  private createPointPreview(root: TransformNode): void {
    const mat = this.getOrCreateMaterial('point');

    const sphere = Mesh.CreateSphere('datum_preview_sphere', 8, 0.02, this.scene, false);
    sphere.material = mat;
    sphere.parent = root;

    this.previewMeshes.push(sphere);
  }

  // -----------------------------------------------------------------------
  // Orientation
  // -----------------------------------------------------------------------

  private orientToDirection(direction: [number, number, number]): Quaternion {
    const dir = new Vector3(direction[0], direction[1], direction[2]).normalize();
    const up = Vector3.Up();
    const d = Vector3.Dot(up, dir);

    if (d > 0.9999) return Quaternion.Identity();
    if (d < -0.9999) return Quaternion.RotationAxis(Vector3.Right(), Math.PI);

    // General case: rotation from Up to dir
    const axis = Vector3.Cross(up, dir).normalize();
    const angle = Math.acos(Math.max(-1, Math.min(1, d)));
    return Quaternion.RotationAxis(axis, angle);
  }

  // -----------------------------------------------------------------------
  // Materials (lazy creation, cached per type)
  // -----------------------------------------------------------------------

  private getOrCreateMaterial(type: DatumPreviewType): StandardMaterial {
    switch (type) {
      case 'plane': {
        if (!this.planeMaterial) {
          this.planeMaterial = this.makePreviewMaterial('datum_preview_mat_plane');
          this.planeMaterial.alpha = 0.6;
        }
        return this.planeMaterial;
      }
      case 'axis': {
        if (!this.axisMaterial) {
          this.axisMaterial = this.makePreviewMaterial('datum_preview_mat_axis');
        }
        return this.axisMaterial;
      }
      case 'point': {
        if (!this.pointMaterial) {
          this.pointMaterial = this.makePreviewMaterial('datum_preview_mat_point');
        }
        return this.pointMaterial;
      }
    }
  }

  private makePreviewMaterial(name: string): StandardMaterial {
    const mat = new StandardMaterial(name, this.scene);
    mat.emissiveColor = PREVIEW_COLOR;
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    return mat;
  }

  // -----------------------------------------------------------------------
  // Body ownership edge indicator
  // -----------------------------------------------------------------------

  private applyBodyOwnership(bodyId: string): void {
    if (bodyId === this.currentBodyId) return;

    // Revert previous body
    this.revertBodyOwnership();

    this.currentBodyId = bodyId;
    const mesh = this.getBodyMesh(bodyId);
    if (!mesh) return;

    this.ownershipBodyMesh = mesh;
    this.savedEdgesColor = mesh.edgesColor ? mesh.edgesColor.clone() : null;
    this.savedEdgesWidth = mesh.edgesWidth;

    mesh.edgesColor = PREVIEW_OWNERSHIP_EDGE_COLOR.clone();
    mesh.edgesWidth = PREVIEW_OWNERSHIP_EDGE_WIDTH;
  }

  private revertBodyOwnership(): void {
    if (this.ownershipBodyMesh) {
      if (this.savedEdgesColor) {
        this.ownershipBodyMesh.edgesColor = this.savedEdgesColor;
      }
      this.ownershipBodyMesh.edgesWidth = this.savedEdgesWidth;
    }
    this.ownershipBodyMesh = null;
    this.savedEdgesColor = null;
    this.savedEdgesWidth = 2.0;
    this.currentBodyId = null;
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  private disposeMeshes(): void {
    if (this.scaleObserver) {
      this.scene.onBeforeRenderObservable.remove(this.scaleObserver);
      this.scaleObserver = null;
    }
    for (const mesh of this.previewMeshes) {
      mesh.dispose();
    }
    this.previewMeshes = [];
    this.previewRoot?.dispose();
    this.previewRoot = null;
  }

  // -----------------------------------------------------------------------
  // Config comparison
  // -----------------------------------------------------------------------

  private configUnchanged(a: DatumPreviewConfig, b: DatumPreviewConfig): boolean {
    if (a.type !== b.type) return false;
    if (a.bodyId !== b.bodyId) return false;

    const posDist = Math.sqrt(
      (a.position[0] - b.position[0]) ** 2 +
        (a.position[1] - b.position[1]) ** 2 +
        (a.position[2] - b.position[2]) ** 2,
    );
    if (posDist > POSITION_EPSILON) return false;

    const dirDist = Math.sqrt(
      (a.direction[0] - b.direction[0]) ** 2 +
        (a.direction[1] - b.direction[1]) ** 2 +
        (a.direction[2] - b.direction[2]) ** 2,
    );
    if (dirDist > DIRECTION_EPSILON) return false;

    return true;
  }
}
