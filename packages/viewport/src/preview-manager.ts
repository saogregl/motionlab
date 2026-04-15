/**
 * preview-manager.ts
 *
 * Owns all transient preview visuals shown during entity creation workflows
 * (datum placement, joint connection, DOF type preview, load direction, etc.).
 * Extracted from SceneGraphManager as part of the sub-manager refactoring.
 */

import {
  ArrowHelper,
  Group,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';

import { ACCENT, PREVIEW_OWNERSHIP_EDGE } from './rendering/colors-three.js';
import {
  createFatLine,
  type FatLineOptions,
  type LineMaterial,
} from './rendering/fat-line-three.js';
import { createJointGlyph, type JointGlyphResult } from './rendering/joint-glyph-three.js';

import {
  type DatumPreviewConfig,
  isBodyEntity,
  type JointPreviewAlignment,
  type LoadStateInput,
  type SceneContext,
} from './scene-context.js';
import { VIEWPORT_PICK_LAYER } from './scene-graph-three.js';
import {
  cloneColor,
  createLine,
  disposeObject3D,
  EPSILON,
  getBodyEdgeLines,
  getLoadBaseColor,
  getLoadKind,
  setObjectLayerRecursive,
} from './scene-graph-utils.js';

// ── PreviewManager ────────────────────────────────────────────────────────

export class PreviewManager {
  // ── Preview group roots ──
  private readonly datumPreviewRoot = new Group();
  private readonly jointPreviewRoot = new Group();
  private readonly dofPreviewRoot = new Group();
  private readonly loadPreviewRoot = new Group();
  private readonly provisionalPreviewRoot = new Group();

  // ── Preview state ──
  private _datumPreviewBodyId: string | null = null;
  private _dofPreviewIndicator: JointGlyphResult | null = null;
  private _provisionalDofIndicator: JointGlyphResult | null = null;

  // ── Scratch vectors (avoid per-call allocations) ──
  private readonly loadAnchor = new Vector3();
  private readonly loadSecond = new Vector3();
  private readonly loadDirection = new Vector3();
  private readonly loadOrientation = new Quaternion();
  private readonly lineOrigin = new Vector3(0, 0, 0);
  private readonly lineStart = new Vector3();
  private readonly lineEnd = new Vector3();

  constructor(private readonly ctx: SceneContext) {
    this.datumPreviewRoot.name = 'datum_preview';
    this.datumPreviewRoot.visible = false;
    setObjectLayerRecursive(this.datumPreviewRoot, VIEWPORT_PICK_LAYER);
    this.ctx.scene.add(this.datumPreviewRoot);

    this.jointPreviewRoot.name = 'joint_preview';
    this.jointPreviewRoot.visible = false;
    setObjectLayerRecursive(this.jointPreviewRoot, VIEWPORT_PICK_LAYER);
    this.ctx.scene.add(this.jointPreviewRoot);

    this.provisionalPreviewRoot.name = 'provisional_joint_preview';
    this.provisionalPreviewRoot.visible = false;
    setObjectLayerRecursive(this.provisionalPreviewRoot, VIEWPORT_PICK_LAYER);
    this.ctx.scene.add(this.provisionalPreviewRoot);

    this.dofPreviewRoot.name = 'dof_preview';
    this.dofPreviewRoot.visible = false;
    setObjectLayerRecursive(this.dofPreviewRoot, VIEWPORT_PICK_LAYER);
    this.ctx.scene.add(this.dofPreviewRoot);

    this.loadPreviewRoot.name = 'load_preview';
    this.loadPreviewRoot.visible = false;
    setObjectLayerRecursive(this.loadPreviewRoot, VIEWPORT_PICK_LAYER);
    this.ctx.scene.add(this.loadPreviewRoot);
  }

  // ── Datum preview ─────────────────────────────────────────────────────

  showDatumPreview(config: DatumPreviewConfig): void {
    const preview = config;
    this.clearDatumPreview();

    this._datumPreviewBodyId = preview.bodyId;

    // Body ownership indicator — tint edge lines on the target body
    const ownerEntity = this.ctx.entities.get(preview.bodyId);
    if (isBodyEntity(ownerEntity)) {
      for (const edgeLines of getBodyEdgeLines(ownerEntity)) {
        const edgeMat = edgeLines.material as LineBasicMaterial;
        edgeMat.color.copy(PREVIEW_OWNERSHIP_EDGE.color);
        edgeMat.opacity = PREVIEW_OWNERSHIP_EDGE.alpha;
        edgeMat.needsUpdate = true;
      }
    }

    this.datumPreviewRoot.visible = true;
    this.datumPreviewRoot.position.set(
      preview.position[0],
      preview.position[1],
      preview.position[2],
    );

    const color = cloneColor(PREVIEW_OWNERSHIP_EDGE.color);
    const previewOpts: FatLineOptions = { color };

    if (preview.type === 'point') {
      // Crosshair lines (flat, no 3D geometry)
      const size = 0.06;
      this.datumPreviewRoot.add(
        createFatLine([new Vector3(-size, 0, 0), new Vector3(size, 0, 0)], previewOpts),
      );
      this.datumPreviewRoot.add(
        createFatLine([new Vector3(0, -size, 0), new Vector3(0, size, 0)], previewOpts),
      );
      this.datumPreviewRoot.add(
        createFatLine([new Vector3(0, 0, -size), new Vector3(0, 0, size)], previewOpts),
      );
      setObjectLayerRecursive(this.datumPreviewRoot, VIEWPORT_PICK_LAYER);
      this.ctx.requestRender();
      return;
    }

    if (preview.type === 'axis') {
      const dir = new Vector3(...(preview.axisDirection ?? [0, 1, 0])).normalize();
      const length = 0.6;
      const tip = dir.clone().multiplyScalar(length);

      // Axis line
      this.datumPreviewRoot.add(createFatLine([new Vector3(0, 0, 0), tip], previewOpts));

      // V arrowhead at tip
      const arrowSize = 0.08;
      const perp = new Vector3();
      if (Math.abs(dir.y) < 0.9) {
        perp.crossVectors(dir, new Vector3(0, 1, 0)).normalize();
      } else {
        perp.crossVectors(dir, new Vector3(1, 0, 0)).normalize();
      }
      const back = tip.clone().sub(dir.clone().multiplyScalar(arrowSize));
      this.datumPreviewRoot.add(
        createFatLine(
          [
            back.clone().add(perp.clone().multiplyScalar(arrowSize * 0.4)),
            tip.clone(),
            back.clone().sub(perp.clone().multiplyScalar(arrowSize * 0.4)),
          ],
          previewOpts,
        ),
      );
      setObjectLayerRecursive(this.datumPreviewRoot, VIEWPORT_PICK_LAYER);
      this.ctx.requestRender();
      return;
    }

    const plane = createLine(
      [
        new Vector3(-0.25, 0, -0.25),
        new Vector3(0.25, 0, -0.25),
        new Vector3(0.25, 0, 0.25),
        new Vector3(-0.25, 0, 0.25),
        new Vector3(-0.25, 0, -0.25),
      ],
      color,
      { entityId: '__datum_preview__', entityType: 'preview' },
    );
    const normal = preview.normal ?? [0, 1, 0];
    plane.quaternion.copy(
      new Quaternion().setFromUnitVectors(
        new Vector3(0, 1, 0),
        new Vector3(normal[0], normal[1], normal[2]).normalize(),
      ),
    );
    this.datumPreviewRoot.add(plane);
    setObjectLayerRecursive(this.datumPreviewRoot, VIEWPORT_PICK_LAYER);
    this.ctx.requestRender();
  }

  /** Return the current datum preview world position, or null if not visible. */
  getDatumPreviewPosition(): { x: number; y: number; z: number } | null {
    if (!this.datumPreviewRoot.visible) return null;
    const p = this.datumPreviewRoot.position;
    return { x: p.x, y: p.y, z: p.z };
  }

  clearDatumPreview(): void {
    // Revert body ownership indicator
    if (this._datumPreviewBodyId) {
      const prevEntity = this.ctx.entities.get(this._datumPreviewBodyId);
      if (isBodyEntity(prevEntity)) {
        for (const edgeLines of getBodyEdgeLines(prevEntity)) {
          const edgeMat = edgeLines.material as LineBasicMaterial;
          edgeMat.color.set(0x202028);
          edgeMat.opacity = 0.3;
          edgeMat.needsUpdate = true;
        }
      }
    }

    while (this.datumPreviewRoot.children.length > 0) {
      const child = this.datumPreviewRoot.children[0];
      this.datumPreviewRoot.remove(child);
      disposeObject3D(child);
    }
    this.datumPreviewRoot.visible = false;
    this._datumPreviewBodyId = null;
    this.ctx.requestRender();
  }

  getDatumPreviewBodyId(): string | null {
    return this._datumPreviewBodyId;
  }

  // ── Load preview ──────────────────────────────────────────────────────

  showLoadPreview(loadState: LoadStateInput | null): void {
    this.clearLoadPreview();
    if (!loadState) return;

    const kindTag = getLoadKind(loadState);
    const anchorDatumId = loadState.datumId ?? loadState.parentDatumId;
    const anchorDatum = anchorDatumId ? this.ctx.entities.get(anchorDatumId) : undefined;
    if (!anchorDatum) return;

    anchorDatum.rootNode.getWorldPosition(this.loadAnchor);
    this.loadPreviewRoot.visible = true;

    if (kindTag === 'spring-damper') {
      const secondDatum = loadState.childDatumId
        ? this.ctx.entities.get(loadState.childDatumId)
        : undefined;
      if (!secondDatum) return;
      secondDatum.rootNode.getWorldPosition(this.loadSecond);
      this.loadPreviewRoot.add(
        createLine([this.loadAnchor, this.loadSecond], getLoadBaseColor(kindTag), {
          entityId: '__load_preview__',
          entityType: 'preview',
        }),
      );
      this.ctx.requestRender();
      return;
    }

    this.loadDirection.set(
      loadState.vector?.x ?? 0,
      loadState.vector?.y ?? 0,
      loadState.vector?.z ?? 0,
    );
    if (loadState.referenceFrame === 'datum-local') {
      anchorDatum.rootNode.getWorldQuaternion(this.loadOrientation);
      this.loadDirection.applyQuaternion(this.loadOrientation);
    }

    const length = Math.max(this.loadDirection.length(), 0.25);
    if (this.loadDirection.lengthSq() > EPSILON) {
      this.loadDirection.normalize();
    } else {
      this.loadDirection.set(0, 1, 0);
    }
    this.lineEnd.copy(this.loadDirection).multiplyScalar(length);

    this.loadPreviewRoot.add(
      createLine(
        [this.loadAnchor, this.loadAnchor.clone().add(this.lineEnd)],
        getLoadBaseColor(kindTag),
        { entityId: '__load_preview__', entityType: 'preview' },
      ),
    );
    this.loadPreviewRoot.add(
      new ArrowHelper(
        this.loadDirection.clone(),
        this.loadAnchor.clone(),
        length,
        getLoadBaseColor(kindTag).getHex(),
        Math.min(length * 0.25, 0.18),
        Math.min(length * 0.14, 0.1),
      ),
    );
    this.ctx.requestRender();
  }

  clearLoadPreview(): void {
    while (this.loadPreviewRoot.children.length > 0) {
      const child = this.loadPreviewRoot.children[0];
      this.loadPreviewRoot.remove(child);
      disposeObject3D(child);
    }
    this.loadPreviewRoot.visible = false;
    this.ctx.requestRender();
  }

  // ── Joint preview line ────────────────────────────────────────────────

  showJointPreviewLine(
    parentDatumId: string,
    childDatumId: string,
    alignment?: JointPreviewAlignment | null,
  ): void {
    const parent = this.ctx.entities.get(parentDatumId);
    const child = this.ctx.entities.get(childDatumId);
    if (!parent || !child) return;

    this.clearJointPreviewLine();

    const start = new Vector3();
    const end = new Vector3();
    parent.rootNode.getWorldPosition(start);
    child.rootNode.getWorldPosition(end);

    const kind = alignment?.kind ?? 'general';
    const lineOpacity = kind === 'general' ? 0.35 : 0.55;

    const line = createLine(this.resolveJointPreviewLinePoints(start, end, alignment), ACCENT, {});
    const material = line.material as LineMaterial;
    material.transparent = true;
    material.opacity = lineOpacity;
    this.jointPreviewRoot.add(line);

    // Alignment-specific visual extras
    if (kind === 'coaxial' && alignment?.axis) {
      // Show dashed axis-extension lines beyond both datums
      const axis = new Vector3(alignment.axis.x, alignment.axis.y, alignment.axis.z).normalize();
      const midpoint = start.clone().add(end).multiplyScalar(0.5);
      const halfLen = Math.max(alignment.distance * 0.5, 0.12);
      const extStart = midpoint.clone().addScaledVector(axis, -(halfLen + 0.08));
      const extEnd = midpoint.clone().addScaledVector(axis, halfLen + 0.08);
      const ext1 = createFatLine([midpoint.clone().addScaledVector(axis, -halfLen), extStart], {
        color: ACCENT,
        lineWidth: 1,
        transparent: true,
        opacity: 0.25,
        dashed: true,
        dashSize: 0.008,
        gapSize: 0.008,
      });
      const ext2 = createFatLine([midpoint.clone().addScaledVector(axis, halfLen), extEnd], {
        color: ACCENT,
        lineWidth: 1,
        transparent: true,
        opacity: 0.25,
        dashed: true,
        dashSize: 0.008,
        gapSize: 0.008,
      });
      this.jointPreviewRoot.add(ext1);
      this.jointPreviewRoot.add(ext2);
    } else if (kind === 'coincident') {
      // Show a highlight sphere at the shared point
      const midpoint = start.clone().add(end).multiplyScalar(0.5);
      const sphere = new Mesh(
        new SphereGeometry(0.015, 12, 12),
        new MeshBasicMaterial({
          color: ACCENT.getHex(),
          transparent: true,
          opacity: 0.5,
          depthTest: false,
        }),
      );
      sphere.position.copy(midpoint);
      this.jointPreviewRoot.add(sphere);
    }

    this.jointPreviewRoot.visible = true;
    setObjectLayerRecursive(this.jointPreviewRoot, VIEWPORT_PICK_LAYER);
    this.ctx.requestRender();
  }

  clearJointPreviewLine(): void {
    while (this.jointPreviewRoot.children.length > 0) {
      const child = this.jointPreviewRoot.children[0];
      this.jointPreviewRoot.remove(child);
      disposeObject3D(child);
    }
    this.jointPreviewRoot.visible = false;
    this.ctx.requestRender();
  }

  // ── Provisional joint preview ─────────────────────────────────────────

  /**
   * Show a provisional connector preview from the parent datum to a cursor
   * world position during the pick-child step. Renders a dashed line + a
   * small sphere at the cursor end.
   */
  showProvisionalJointPreview(
    parentDatumId: string,
    cursorWorldPos: { x: number; y: number; z: number },
  ): void {
    const parent = this.ctx.entities.get(parentDatumId);
    if (!parent) return;

    this.clearProvisionalJointPreview();

    const start = new Vector3();
    parent.rootNode.getWorldPosition(start);
    const end = new Vector3(cursorWorldPos.x, cursorWorldPos.y, cursorWorldPos.z);

    const line = createFatLine([start, end], {
      color: ACCENT,
      lineWidth: 2,
      transparent: true,
      opacity: 0.4,
      dashed: true,
      dashSize: 0.015,
      gapSize: 0.01,
    });
    this.provisionalPreviewRoot.add(line);

    // Small sphere at cursor position
    const sphere = new Mesh(
      new SphereGeometry(0.008, 12, 12),
      new MeshBasicMaterial({ color: ACCENT.getHex(), transparent: true, opacity: 0.6 }),
    );
    sphere.position.copy(end);
    this.provisionalPreviewRoot.add(sphere);

    this.provisionalPreviewRoot.visible = true;
    setObjectLayerRecursive(this.provisionalPreviewRoot, VIEWPORT_PICK_LAYER);
    this.ctx.requestRender();
  }

  clearProvisionalJointPreview(): void {
    while (this.provisionalPreviewRoot.children.length > 0) {
      const child = this.provisionalPreviewRoot.children[0];
      this.provisionalPreviewRoot.remove(child);
      disposeObject3D(child);
    }
    this.provisionalPreviewRoot.visible = false;
    this.clearProvisionalDofPreview();
    this.ctx.requestRender();
  }

  // ── Provisional DOF preview ───────────────────────────────────────────

  /**
   * Show a mini DOF indicator at the given world position during pick-child hover,
   * giving the user a spatial preview of the inferred joint type.
   */
  showProvisionalDofPreview(
    position: { x: number; y: number; z: number },
    jointType: string,
    axisDirection?: { x: number; y: number; z: number } | null,
  ): void {
    this.clearProvisionalDofPreview();

    const axis = axisDirection
      ? new Vector3(axisDirection.x, axisDirection.y, axisDirection.z)
      : undefined;
    const glyph = createJointGlyph(jointType, axis);
    glyph.rootNode.position.set(position.x, position.y, position.z);
    glyph.rootNode.scale.setScalar(0.5);
    glyph.setOpacity(0.35);

    this.provisionalPreviewRoot.add(glyph.rootNode);
    this._provisionalDofIndicator = glyph;
    setObjectLayerRecursive(this.provisionalPreviewRoot, VIEWPORT_PICK_LAYER);
    this.ctx.requestRender();
  }

  private clearProvisionalDofPreview(): void {
    if (this._provisionalDofIndicator) {
      this._provisionalDofIndicator.rootNode.removeFromParent();
      this._provisionalDofIndicator.dispose();
      this._provisionalDofIndicator = null;
    }
  }

  // ── Joint type preview (DOF glyph) ───────────────────────────────────

  showJointTypePreview(
    jointType: string,
    parentDatumId: string,
    childDatumId: string,
    alignmentAxis?: { x: number; y: number; z: number } | null,
  ): void {
    this.clearJointTypePreview();

    const parent = this.ctx.entities.get(parentDatumId);
    const child = this.ctx.entities.get(childDatumId);
    if (!parent || !child) return;

    const start = new Vector3();
    const end = new Vector3();
    parent.rootNode.getWorldPosition(start);
    child.rootNode.getWorldPosition(end);
    const midpoint = start.clone().add(end).multiplyScalar(0.5);
    const previewAxis = alignmentAxis
      ? new Vector3(alignmentAxis.x, alignmentAxis.y, alignmentAxis.z)
      : end.clone().sub(start);
    if (previewAxis.lengthSq() < EPSILON) {
      previewAxis.set(0, 0, 1);
    }
    previewAxis.normalize();

    const glyph = createJointGlyph(jointType, previewAxis);
    glyph.rootNode.position.copy(midpoint);
    glyph.setOpacity(0.5);

    this.dofPreviewRoot.add(glyph.rootNode);
    this.dofPreviewRoot.visible = true;
    this._dofPreviewIndicator = glyph;
    setObjectLayerRecursive(this.dofPreviewRoot, VIEWPORT_PICK_LAYER);
    this.ctx.requestRender();
  }

  clearJointTypePreview(): void {
    if (this._dofPreviewIndicator) {
      this._dofPreviewIndicator.dispose();
      this._dofPreviewIndicator = null;
    }
    while (this.dofPreviewRoot.children.length > 0) {
      const child = this.dofPreviewRoot.children[0];
      this.dofPreviewRoot.remove(child);
      disposeObject3D(child);
    }
    this.dofPreviewRoot.visible = false;
    this.ctx.requestRender();
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  /** Clear all preview visuals (called during SceneGraphManager.clear()). */
  clear(): void {
    this.clearDatumPreview();
    this.clearJointPreviewLine();
    this.clearJointTypePreview();
  }

  /** Remove preview roots from scene and dispose resources. */
  dispose(): void {
    this.ctx.scene.remove(this.datumPreviewRoot);
    disposeObject3D(this.datumPreviewRoot);
    this.ctx.scene.remove(this.jointPreviewRoot);
    disposeObject3D(this.jointPreviewRoot);
    this.ctx.scene.remove(this.provisionalPreviewRoot);
    disposeObject3D(this.provisionalPreviewRoot);
    this.ctx.scene.remove(this.dofPreviewRoot);
    disposeObject3D(this.dofPreviewRoot);
    this.ctx.scene.remove(this.loadPreviewRoot);
    disposeObject3D(this.loadPreviewRoot);
  }

  // ── Private helpers ───────────────────────────────────────────────────

  private resolveJointPreviewLinePoints(
    start: Vector3,
    end: Vector3,
    alignment?: JointPreviewAlignment | null,
  ): [Vector3, Vector3] {
    if (!alignment?.axis || (alignment.kind !== 'coaxial' && alignment.kind !== 'coplanar')) {
      return [start, end];
    }

    const axis = new Vector3(alignment.axis.x, alignment.axis.y, alignment.axis.z);
    if (axis.lengthSq() < EPSILON) {
      return [start, end];
    }

    axis.normalize();
    const midpoint = start.clone().add(end).multiplyScalar(0.5);
    const halfLength = Math.max(alignment.distance * 0.5, 0.12);
    return [
      midpoint.clone().addScaledVector(axis, -halfLength),
      midpoint.clone().addScaledVector(axis, halfLength),
    ];
  }
}
