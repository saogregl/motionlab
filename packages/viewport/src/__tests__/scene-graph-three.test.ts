import { describe, expect, it } from 'vitest';
import { OrthographicCamera, Scene, Vector3 } from 'three';

import { createMaterialFactory } from '../rendering/materials-three.js';
import { SceneGraphManager } from '../scene-graph-three.js';

function makeManager() {
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, -100, 100);
  camera.position.set(5, 5, 5);
  camera.lookAt(0, 0, 0);
  const materialFactory = createMaterialFactory(scene);
  const manager = new SceneGraphManager(scene, camera, { materialFactory });
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

    manager.highlightFace('body-1', 0);
    const entity = manager.getEntity('body-1');
    const colorAttr = entity?.meshes[0].geometry.getAttribute('color');
    expect(colorAttr?.getX(0)).not.toBeCloseTo(1);

    manager.clearFaceHighlight('body-1');
    expect(colorAttr?.getX(0)).toBeCloseTo(1);

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
});
