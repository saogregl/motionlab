import { describe, expect, it, vi } from 'vitest';
import { MeshStandardMaterial, OrthographicCamera, Scene, Vector3 } from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';

import { ENTITY_COLORS } from '../rendering/colors-three.js';
import { createMaterialFactory } from '../rendering/materials-three.js';
import { SceneGraphManager, VIEWPORT_PICK_LAYER } from '../scene-graph-three.js';
import { createCylinderMeshDataWithTopology } from '../story-helpers.js';

function makeManager(requestRender?: () => void) {
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, -100, 100);
  camera.position.set(5, 5, 5);
  camera.lookAt(0, 0, 0);
  const materialFactory = createMaterialFactory();
  const manager = new SceneGraphManager(scene, camera, { materialFactory, requestRender });
  manager.setCanvasSize(200, 100);
  return { scene, camera, manager, materialFactory };
}

function makeBodyMesh() {
  return {
    vertices: new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
      0, 0, 1,
    ]),
    indices: new Uint32Array([
      0, 1, 2,
      0, 1, 3,
    ]),
    normals: new Float32Array([
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
      0, 1, 0,
    ]),
  };
}

function getFirstDatumLineOpacity(manager: SceneGraphManager, datumId: string): number | null {
  const datum = manager.getEntity(datumId);
  if (!datum) return null;

  let opacity: number | null = null;
  datum.rootNode.traverse((child) => {
    if (opacity !== null) return;
    if ('material' in child && child.material && typeof child.material === 'object' && 'opacity' in child.material) {
      opacity = Number(child.material.opacity);
    }
  });

  return opacity;
}

describe('SceneGraphManager', () => {
  it('adds bodies and exposes geometry index and mesh data', () => {
    const { manager, materialFactory } = makeManager();

    manager.addBody(
      'body-1',
      'Body 1',
      makeBodyMesh(),
      { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
      new Uint32Array([1, 1]),
    );

    expect(manager.getAllEntities()).toHaveLength(1);
    expect(manager.getBodyMeshIndices('body-1')).toEqual(makeBodyMesh().indices);
    expect(manager.getBodyMeshNormals('body-1')).toEqual(makeBodyMesh().normals);
    expect(manager.getBodyGeometryIndex('body-1')).toBeTruthy();
    expect(manager.getBodyBvhState('body-1')).toBe('ready');

    manager.dispose();
    materialFactory.dispose();
  });

  it('renders multi-geometry bodies with per-geometry local poses', () => {
    const { manager, materialFactory } = makeManager();

    manager.upsertBody('body-1', 'Body 1', {
      position: [1, 2, 3],
      rotation: [0, 0, 0, 1],
    });
    manager.addBodyGeometry(
      'body-1',
      'geom-a',
      'Geom A',
      makeBodyMesh(),
      { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
      new Uint32Array([1, 1]),
    );
    manager.addBodyGeometry(
      'body-1',
      'geom-b',
      'Geom B',
      makeBodyMesh(),
      { position: [5, 0, 0], rotation: [0, 0, 0, 1] },
      new Uint32Array([1, 1]),
    );

    const entity = manager.getEntity('body-1');
    expect(entity?.meshes).toHaveLength(2);

    const firstWorld = entity?.meshes[0].getWorldPosition(new Vector3());
    const secondWorld = entity?.meshes[1].getWorldPosition(new Vector3());
    expect(firstWorld?.toArray()).toEqual([1, 2, 3]);
    expect(secondWorld?.toArray()).toEqual([6, 2, 3]);
    expect(manager.getGeometryIndex('body-1', 'geom-a')).toBeTruthy();
    expect(manager.getGeometryIndex('body-1', 'geom-b')).toBeTruthy();

    manager.dispose();
    materialFactory.dispose();
  });

  it('parents datums under bodies and keeps world position in sync', () => {
    const { manager, materialFactory } = makeManager();

    manager.addBody(
      'body-1',
      'Body 1',
      makeBodyMesh(),
      { position: [1, 2, 3], rotation: [0, 0, 0, 1] },
      new Uint32Array([1, 1]),
    );
    manager.addDatum('datum-1', 'body-1', {
      position: [0.5, 0, 0],
      rotation: [0, 0, 0, 1],
    });

    const before = manager.getEntityWorldPosition('datum-1');
    expect(before).toEqual({ x: 1.5, y: 2, z: 3 });

    manager.updateBodyTransform('body-1', {
      position: [3, 4, 5],
      rotation: [0, 0, 0, 1],
    });

    const after = manager.getEntityWorldPosition('datum-1');
    expect(after).toEqual({ x: 3.5, y: 4, z: 5 });

    manager.dispose();
    materialFactory.dispose();
  });

  it('positions joints between datum world positions', () => {
    const { manager, materialFactory } = makeManager();

    manager.addBody('body-a', 'A', makeBodyMesh(), {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    });
    manager.addBody('body-b', 'B', makeBodyMesh(), {
      position: [2, 0, 0],
      rotation: [0, 0, 0, 1],
    });
    manager.addDatum('datum-a', 'body-a', {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    });
    manager.addDatum('datum-b', 'body-b', {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    });
    manager.addJoint('joint-1', 'datum-a', 'datum-b', 'revolute');

    const joint = manager.getEntity('joint-1');
    expect(joint).toBeTruthy();
    expect(joint?.rootNode.position.x).toBeCloseTo(1);
    expect(joint?.rootNode.position.y).toBeCloseTo(0);

    manager.dispose();
    materialFactory.dispose();
  });

  it('highlights and clears a picked face via vertex colors', () => {
    const { manager, materialFactory } = makeManager();

    manager.addBody(
      'body-1',
      'Body 1',
      makeBodyMesh(),
      { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
      new Uint32Array([1, 1]),
    );

    manager.highlightFace('body-1', 'body-1', 0);
    const entity = manager.getEntity('body-1');
    const colorAttr = entity?.meshes[0].geometry.getAttribute('color');
    expect(colorAttr?.getX(0)).not.toBeCloseTo(1);

    manager.clearFaceHighlight('body-1');
    expect(colorAttr?.getX(0)).toBeCloseTo(1);

    manager.dispose();
    materialFactory.dispose();
  });

  it('isolates face highlight to the picked geometry on multi-geometry bodies', () => {
    const { manager, materialFactory } = makeManager();

    manager.upsertBody('body-1', 'Body 1', {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    });
    manager.addBodyGeometry(
      'body-1',
      'geom-a',
      'Geom A',
      makeBodyMesh(),
      { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
      new Uint32Array([1, 1]),
    );
    manager.addBodyGeometry(
      'body-1',
      'geom-b',
      'Geom B',
      makeBodyMesh(),
      { position: [2, 0, 0], rotation: [0, 0, 0, 1] },
      new Uint32Array([1, 1]),
    );

    manager.highlightFace('body-1', 'geom-b', 0);
    const entity = manager.getEntity('body-1');
    const colorA = entity?.meshes[0].geometry.getAttribute('color');
    const colorB = entity?.meshes[1].geometry.getAttribute('color');

    expect(colorA).toBeUndefined();
    expect(colorB?.getX(0)).not.toBeCloseTo(1);

    manager.clearFaceHighlight('body-1');
    expect(colorB?.getX(0)).toBeCloseTo(1);

    manager.dispose();
    materialFactory.dispose();
  });

  it('batch-updates body transforms while keeping dependent joint visuals in sync', () => {
    const { manager, materialFactory } = makeManager();

    manager.addBody('body-a', 'A', makeBodyMesh(), {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    });
    manager.addBody('body-b', 'B', makeBodyMesh(), {
      position: [2, 0, 0],
      rotation: [0, 0, 0, 1],
    });
    manager.addDatum('datum-a', 'body-a', {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    });
    manager.addDatum('datum-b', 'body-b', {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    });
    manager.addJoint('joint-1', 'datum-a', 'datum-b', 'revolute');

    manager.applyBodyTransforms([
      {
        id: 'body-a',
        pose: { position: [1, 0, 0], rotation: [0, 0, 0, 1] },
      },
      {
        id: 'body-b',
        pose: { position: [4, 0, 0], rotation: [0, 0, 0, 1] },
      },
    ]);

    const joint = manager.getEntity('joint-1');
    expect(joint?.rootNode.position.x).toBeCloseTo(2.5);

    manager.dispose();
    materialFactory.dispose();
  });

  it('requests renders when batched scene updates occur', () => {
    const requestRender = vi.fn();
    const { manager, materialFactory } = makeManager(requestRender);

    manager.addBody('body-a', 'A', makeBodyMesh(), {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    });
    requestRender.mockClear();

    manager.applyBodyTransforms([
      {
        id: 'body-a',
        pose: { position: [1, 2, 3], rotation: [0, 0, 0, 1] },
      },
    ]);

    expect(requestRender).toHaveBeenCalledTimes(1);

    manager.dispose();
    materialFactory.dispose();
  });

  it('caches face preview analysis for repeated lookups', () => {
    const { manager, materialFactory } = makeManager();

    manager.addBody(
      'body-1',
      'Body 1',
      makeBodyMesh(),
      { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
      new Uint32Array([1, 1]),
    );

    const first = manager.getBodyFacePreview('body-1', 0);
    const second = manager.getBodyFacePreview('body-1', 0);

    expect(first).toBeTruthy();
    expect(second).toBe(first);

    manager.dispose();
    materialFactory.dispose();
  });

  it('applies selection, visibility, and projects world positions to screen space', () => {
    const { manager, camera, materialFactory } = makeManager();

    manager.addBody('body-1', 'Body 1', makeBodyMesh(), {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    });

    manager.applySelection(new Set(['body-1']));
    manager.applyHover('body-1');
    manager.setEntityVisibility('body-1', false);

    const entity = manager.getEntity('body-1');
    expect(entity?.rootNode.visible).toBe(false);

    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    const projected = manager.projectToScreen({ x: 0, y: 0, z: 0 });
    expect(projected.x).toBeCloseTo(100, 0);
    expect(projected.y).toBeCloseTo(50, 0);

    manager.dispose();
    materialFactory.dispose();
  });

  it('preserves same-body dimming when joint-creation emphasis is applied', () => {
    const { manager, materialFactory } = makeManager();

    manager.addBody('body-a', 'A', makeBodyMesh(), {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    });
    manager.addBody('body-b', 'B', makeBodyMesh(), {
      position: [2, 0, 0],
      rotation: [0, 0, 0, 1],
    });
    manager.addDatum('parent', 'body-a', {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    });
    manager.addDatum('same-body', 'body-a', {
      position: [0.2, 0, 0],
      rotation: [0, 0, 0, 1],
    });
    manager.addDatum('other-body', 'body-b', {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    });

    manager.dimDatumsByBody('body-a');
    manager.applyJointCreationHighlights('parent', null);

    expect(getFirstDatumLineOpacity(manager, 'parent')).toBeCloseTo(1);
    expect(getFirstDatumLineOpacity(manager, 'same-body')).toBeCloseTo(0.2);
    expect(getFirstDatumLineOpacity(manager, 'other-body')).toBeCloseTo(0.45);

    manager.dispose();
    materialFactory.dispose();
  });

  it('uses semantic alignment axes for the joint preview line', () => {
    const { manager, materialFactory } = makeManager();

    manager.addBody('body-a', 'A', makeBodyMesh(), {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    });
    manager.addBody('body-b', 'B', makeBodyMesh(), {
      position: [0, 0, 2],
      rotation: [0, 0, 0, 1],
    });
    manager.addDatum('datum-a', 'body-a', {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    });
    manager.addDatum('datum-b', 'body-b', {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    });

    manager.showJointPreviewLine('datum-a', 'datum-b', {
      kind: 'coaxial',
      axis: { x: 1, y: 0, z: 0 },
      distance: 2,
    });

    const previewRoot = (manager as any).jointPreviewRoot;
    const line = previewRoot.children[0] as Line2;
    // Line2 stores segment pairs as instanceStart/instanceEnd
    const instanceStart = line.geometry.getAttribute('instanceStart');
    const instanceEnd = line.geometry.getAttribute('instanceEnd');

    expect(instanceStart.getX(0)).toBeCloseTo(-1);
    expect(instanceStart.getZ(0)).toBeCloseTo(1);
    expect(instanceEnd.getX(0)).toBeCloseTo(1);
    expect(instanceEnd.getZ(0)).toBeCloseTo(1);

    manager.dispose();
    materialFactory.dispose();
  });

  it('updates selected joint limit markers with the latest runtime value', () => {
    const { manager, materialFactory } = makeManager();

    manager.addBody('body-a', 'A', makeBodyMesh(), {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    });
    manager.addBody('body-b', 'B', makeBodyMesh(), {
      position: [0, 0, 1],
      rotation: [0, 0, 0, 1],
    });
    manager.addDatum('datum-a', 'body-a', {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    });
    manager.addDatum('datum-b', 'body-b', {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    });
    manager.addJoint('joint-1', 'datum-a', 'datum-b', 'prismatic');
    manager.updateJointLimits('joint-1', 0, 0.5);
    manager.applySelection(new Set(['joint-1']));
    manager.updateJointLimitValue('joint-1', 0.25);

    const visual = (manager as any).activeLimitVisuals.get('joint-1');
    const marker = visual.rootNode.children[1];

    expect(marker.visible).toBe(true);
    expect(marker.position.z).toBeCloseTo(0.25);

    manager.dispose();
    materialFactory.dispose();
  });

  it('focuses camera presets on scene content', () => {
    const { manager, camera, materialFactory } = makeManager();

    manager.addBody('body-1', 'Body 1', makeBodyMesh(), {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    });
    manager.setCameraPreset('top');

    const direction = new Vector3();
    camera.getWorldDirection(direction);
    expect(Math.abs(direction.y)).toBeGreaterThan(0.9);

    manager.dispose();
    materialFactory.dispose();
  });

  it('applies entity-type selection colors instead of uniform accent', () => {
    const { manager, materialFactory } = makeManager();

    // Default body color is #8faac8 (r≈0.56, g≈0.67, b≈0.78)
    manager.addBody('body-1', 'Body 1', makeBodyMesh(), {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    });

    const entity = manager.getEntity('body-1');
    const mat = entity?.meshes[0].material as MeshStandardMaterial;
    const originalR = mat.color.r;

    // Select the body — should tint toward ENTITY_BODY steel blue (0.29, 0.565, 0.851)
    manager.applySelection(new Set(['body-1']));

    // The tinted color is lerped 30% toward ENTITY_BODY from the original.
    // ENTITY_BODY.r = 0.29, which is lower than ACCENT.r = 0.06.
    // So the tinted red channel should be pulled toward 0.29, not toward 0.06.
    const tintedR = mat.color.r;
    const bodyColorR = ENTITY_COLORS.body.r;
    const expectedR = originalR + (bodyColorR - originalR) * 0.3;
    expect(tintedR).toBeCloseTo(expectedR, 2);

    // Deselect and verify restore
    manager.applySelection(new Set());
    expect(mat.color.r).toBeCloseTo(originalR, 2);

    manager.dispose();
    materialFactory.dispose();
  });

  it('places viewport-owned pick meshes on the dedicated picking layer', () => {
    const { manager, materialFactory } = makeManager();

    manager.addBody('body-1', 'Body 1', makeBodyMesh(), {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    });
    manager.addDatum('datum-1', 'body-1', {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    });

    const body = manager.getEntity('body-1');
    const datum = manager.getEntity('datum-1');

    expect(body?.meshes[0].layers.isEnabled(VIEWPORT_PICK_LAYER)).toBe(true);
    expect(datum?.meshes[0].layers.isEnabled(VIEWPORT_PICK_LAYER)).toBe(true);

    manager.dispose();
    materialFactory.dispose();
  });

  it('rotates datum-local load vectors into world space', () => {
    const { manager, materialFactory } = makeManager();
    const sin45 = Math.sin(Math.PI / 4);
    const cos45 = Math.cos(Math.PI / 4);

    manager.addBody('body-1', 'Body 1', makeBodyMesh(), {
      position: [0, 0, 0],
      rotation: [0, 0, sin45, cos45],
    });
    manager.addDatum('datum-1', 'body-1', {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    });
    manager.addLoadVisual('load-1', {
      type: 'point-force',
      datumId: 'datum-1',
      vector: { x: 1, y: 0, z: 0 },
      referenceFrame: 'datum-local',
    });

    const load = manager.getEntity('load-1');
    expect(load).toBeTruthy();
    const shaft = load?.rootNode.children[0] as Line2;
    expect(shaft).toBeInstanceOf(Line2);
    // Line2 stores segment pairs as instanceStart/instanceEnd
    const instanceEnd = shaft.geometry.getAttribute('instanceEnd');
    // The end point (second point) of the shaft line:
    expect(instanceEnd.getX(0)).toBeCloseTo(0, 5);
    expect(instanceEnd.getY(0)).toBeGreaterThan(0.9);

    manager.dispose();
    materialFactory.dispose();
  });

  it('rebuilds load visuals when the load kind changes', () => {
    const { manager, materialFactory } = makeManager();

    manager.addBody('body-1', 'Body 1', makeBodyMesh(), {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    });
    manager.addBody('body-2', 'Body 2', makeBodyMesh(), {
      position: [2, 0, 0],
      rotation: [0, 0, 0, 1],
    });
    manager.addDatum('datum-1', 'body-1', {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    });
    manager.addDatum('datum-2', 'body-2', {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    });

    manager.addLoadVisual('load-1', {
      type: 'point-force',
      datumId: 'datum-1',
      vector: { x: 0, y: 1, z: 0 },
      referenceFrame: 'world',
    });
    expect(manager.getEntity('load-1')?.rootNode.children).toHaveLength(3);

    manager.updateLoadVisual('load-1', {
      type: 'spring-damper',
      parentDatumId: 'datum-1',
      childDatumId: 'datum-2',
    });

    expect(manager.getEntity('load-1')?.rootNode.children).toHaveLength(2);

    manager.dispose();
    materialFactory.dispose();
  });

  it('computes planar face centroid in world space', () => {
    const { manager, materialFactory } = makeManager();

    manager.addBody(
      'body-1',
      'Body 1',
      makeBodyMesh(),
      { position: [2, 0, 0], rotation: [0, 0, 0, 1] },
      new Uint32Array([1, 1]),
    );

    // Face 0 has triangle 0: vertices 0,1,2 = (0,0,0), (1,0,0), (0,1,0)
    // Centroid in local space = (1/3, 1/3, 0)
    // Centroid in world space = (2 + 1/3, 1/3, 0)
    const centroid = manager.getBodyFaceCentroidWorld('body-1', 0);
    expect(centroid).toBeTruthy();
    expect(centroid![0]).toBeCloseTo(2 + 1 / 3, 4);
    expect(centroid![1]).toBeCloseTo(1 / 3, 4);
    expect(centroid![2]).toBeCloseTo(0, 4);

    manager.dispose();
    materialFactory.dispose();
  });

  it('computes cylindrical face axis center via circle fit', () => {
    const { manager, materialFactory } = makeManager();

    // Build a cylinder: radius=0.6, height=2, 48 segments
    // partIndex: [96 (side), 48 (top cap), 48 (bottom cap)]
    const cyl = createCylinderMeshDataWithTopology(0.6, 0.6, 2, 48);

    // Place the cylinder at [3, 1, 0] so the axis center is at world (3, 1, 0)
    manager.addBody('cyl', 'Cylinder', cyl, {
      position: [3, 1, 0],
      rotation: [0, 0, 0, 1],
    }, cyl.partIndex);

    // Face 0 = side face (cylindrical). The axis center in local space should
    // be at (0, 0, 0) — the center of the cylinder. In world space: (3, 1, 0).
    const centroid = manager.getBodyFaceCentroidWorld('cyl', 0);
    expect(centroid).toBeTruthy();
    expect(centroid![0]).toBeCloseTo(3, 2);
    expect(centroid![1]).toBeCloseTo(1, 2);
    expect(centroid![2]).toBeCloseTo(0, 2);

    // Face 1 = top cap (planar). Centroid should be near the cap center: (0, 1, 0) local.
    // In world space: (3, 2, 0). Tolerance 1 for small tessellation-seam bias.
    const topCap = manager.getBodyFaceCentroidWorld('cyl', 1);
    expect(topCap).toBeTruthy();
    expect(topCap![0]).toBeCloseTo(3, 1);
    expect(topCap![1]).toBeCloseTo(2, 1);
    expect(topCap![2]).toBeCloseTo(0, 1);

    manager.dispose();
    materialFactory.dispose();
  });

  it('updates actuator visuals when the parent joint changes', () => {
    const { manager, materialFactory } = makeManager();

    manager.addBody('body-a', 'A', makeBodyMesh(), {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    });
    manager.addBody('body-b', 'B', makeBodyMesh(), {
      position: [2, 0, 0],
      rotation: [0, 0, 0, 1],
    });
    manager.addBody('body-c', 'C', makeBodyMesh(), {
      position: [4, 0, 0],
      rotation: [0, 0, 0, 1],
    });
    manager.addDatum('datum-a', 'body-a', {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    });
    manager.addDatum('datum-b', 'body-b', {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    });
    manager.addDatum('datum-c', 'body-c', {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    });
    manager.addJoint('joint-1', 'datum-a', 'datum-b', 'revolute');
    manager.addJoint('joint-2', 'datum-b', 'datum-c', 'prismatic');

    manager.addMotorVisual('actuator-1', 'joint-1', 'revolute-motor');
    const beforeParent = manager.getEntity('actuator-1')?.rootNode.parent;

    manager.updateMotorVisual('actuator-1', 'joint-2', 'prismatic-motor');
    const afterParent = manager.getEntity('actuator-1')?.rootNode.parent;

    expect(beforeParent).not.toBe(afterParent);
    expect(afterParent).toBe(manager.getEntity('joint-2')?.rootNode);

    manager.dispose();
    materialFactory.dispose();
  });
});
