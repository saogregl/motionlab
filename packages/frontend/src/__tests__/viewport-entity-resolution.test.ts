import { describe, expect, it } from 'vitest';

import type { BodyState, GeometryState } from '../stores/mechanism.js';
import {
  resolveViewportEntityId,
  resolveViewportEntityIds,
} from '../utils/viewport-entity-resolution.js';

function makeBody(id: string): BodyState {
  return {
    id,
    name: id,
    massProperties: {
      mass: 1,
      centerOfMass: { x: 0, y: 0, z: 0 },
      ixx: 1,
      iyy: 1,
      izz: 1,
      ixy: 0,
      ixz: 0,
      iyz: 0,
    },
    pose: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    },
  };
}

function makeGeometry(id: string, parentBodyId: string | null): GeometryState {
  return {
    id,
    name: id,
    parentBodyId,
    localPose: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    },
    meshData: {
      vertices: new Float32Array(),
      indices: new Uint32Array(),
      normals: new Float32Array(),
    },
    computedMassProperties: {
      mass: 1,
      centerOfMass: { x: 0, y: 0, z: 0 },
      ixx: 1,
      iyy: 1,
      izz: 1,
      ixy: 0,
      ixz: 0,
      iyz: 0,
    },
    sourceAssetRef: { contentHash: '', originalFilename: '' },
  };
}

describe('viewport entity resolution', () => {
  const bodies = new Map([['body-1', makeBody('body-1')]]);
  const geometries = new Map<string, GeometryState>([
    ['geom-1', makeGeometry('geom-1', 'body-1')],
    ['geom-2', makeGeometry('geom-2', null)],
  ]);

  it('maps parented geometry ids to their body ids', () => {
    expect(resolveViewportEntityId('geom-1', bodies, geometries)).toBe('body-1');
  });

  it('drops unparented geometry ids', () => {
    expect(resolveViewportEntityId('geom-2', bodies, geometries)).toBeNull();
  });

  it('deduplicates resolved viewport selection ids', () => {
    const resolved = resolveViewportEntityIds(
      new Set(['body-1', 'geom-1']),
      bodies,
      geometries,
    );
    expect(resolved).toEqual(new Set(['body-1']));
  });
});
