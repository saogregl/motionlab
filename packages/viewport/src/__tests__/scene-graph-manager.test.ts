import { ArcRotateCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type MeshDataInput,
  type PoseInput,
  type SceneGraphDeps,
  SceneGraphManager,
} from '../scene-graph.js';

// ---------------------------------------------------------------------------
// Minimal test data
// ---------------------------------------------------------------------------

const minimalMesh: MeshDataInput = {
  vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  indices: new Uint32Array([0, 1, 2]),
  normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
};

const defaultPose: PoseInput = {
  position: [0, 0, 0],
  rotation: [0, 0, 0, 1],
};

const offsetPose: PoseInput = {
  position: [5, 10, 15],
  rotation: [0, 0, 0, 1],
};

// ---------------------------------------------------------------------------
// Stub deps
// ---------------------------------------------------------------------------

function makeMockDeps(): SceneGraphDeps {
  return {
    materialFactory: {
      getDefaultMaterial: () => null as unknown,
      getSelectedMaterial: () => null as unknown,
      getHoveredMaterial: () => null as unknown,
    } as unknown as SceneGraphDeps['materialFactory'],
    lightingRig: {} as unknown as SceneGraphDeps['lightingRig'],
    selectionVisuals: {
      applySelection: vi.fn(),
      applyHover: vi.fn(),
      clearAll: vi.fn(),
    } as unknown as SceneGraphDeps['selectionVisuals'],
    grid: {
      visible: true,
      setVisible: vi.fn(),
    } as unknown as SceneGraphDeps['grid'],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SceneGraphManager', () => {
  let engine: NullEngine;
  let scene: Scene;
  let camera: ArcRotateCamera;
  let sgm: SceneGraphManager;
  let deps: SceneGraphDeps;

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    camera = new ArcRotateCamera('cam', 0, 0, 10, Vector3.Zero(), scene);
    deps = makeMockDeps();
    sgm = new SceneGraphManager(scene, camera, deps);
  });

  afterEach(() => {
    sgm.dispose();
    scene.dispose();
    engine.dispose();
  });

  // --- Body management ---

  it('addBody creates entity', () => {
    const entity = sgm.addBody('b1', 'Body1', minimalMesh, defaultPose);
    expect(entity.id).toBe('b1');
    expect(entity.type).toBe('body');
    expect(sgm.getEntity('b1')).toBe(entity);
  });

  it('addBody sets pose', () => {
    sgm.addBody('b1', 'Body1', minimalMesh, offsetPose);
    const entity = sgm.getEntity('b1');
    expect(entity?.rootNode.position.x).toBe(5);
    expect(entity?.rootNode.position.y).toBe(10);
    expect(entity?.rootNode.position.z).toBe(15);
  });

  it('removeBody deletes entity', () => {
    sgm.addBody('b1', 'Body1', minimalMesh, defaultPose);
    const result = sgm.removeBody('b1');
    expect(result).toBe(true);
    expect(sgm.getEntity('b1')).toBeUndefined();
  });

  it('removeBody unknown returns false', () => {
    expect(sgm.removeBody('nonexistent')).toBe(false);
  });

  it('updateBodyTransform updates pose', () => {
    sgm.addBody('b1', 'Body1', minimalMesh, defaultPose);
    sgm.updateBodyTransform('b1', offsetPose);
    const entity = sgm.getEntity('b1');
    expect(entity?.rootNode.position.x).toBe(5);
    expect(entity?.rootNode.position.y).toBe(10);
    expect(entity?.rootNode.position.z).toBe(15);
  });

  it('updateBodyTransform preserves entity identity', () => {
    sgm.addBody('b1', 'Body1', minimalMesh, defaultPose);
    const before = sgm.getEntity('b1');
    sgm.updateBodyTransform('b1', offsetPose);
    const after = sgm.getEntity('b1');
    expect(after).toBe(before);
  });

  it('updateBodyTransform unknown is silent', () => {
    expect(() => sgm.updateBodyTransform('nonexistent', defaultPose)).not.toThrow();
  });

  // --- Datum management ---

  it('addDatum parents to body', () => {
    sgm.addBody('b1', 'Body1', minimalMesh, defaultPose);
    const datum = sgm.addDatum('d1', 'b1', defaultPose);
    expect(datum).toBeDefined();
    const bodyEntity = sgm.getEntity('b1');
    expect(datum?.rootNode.parent).toBe(bodyEntity?.rootNode);
  });

  it('addDatum missing parent returns undefined', () => {
    const result = sgm.addDatum('d1', 'nonexistent', defaultPose);
    expect(result).toBeUndefined();
  });

  // --- Pickable meshes ---

  it('getAllPickableMeshes returns all meshes', () => {
    sgm.addBody('b1', 'Body1', minimalMesh, defaultPose);
    sgm.addBody('b2', 'Body2', minimalMesh, defaultPose);
    const meshes = sgm.getAllPickableMeshes();
    // Each body has 1 mesh
    expect(meshes.length).toBeGreaterThanOrEqual(2);
  });

  // --- Dispose ---

  it('dispose clears entities', () => {
    sgm.addBody('b1', 'Body1', minimalMesh, defaultPose);
    sgm.addBody('b2', 'Body2', minimalMesh, defaultPose);
    sgm.dispose();
    expect(sgm.getAllEntities()).toHaveLength(0);
  });
});
