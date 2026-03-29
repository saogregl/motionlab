import { describe, expect, it } from 'vitest';

import { resolveDatumFacePick } from '../utils/datum-face-pick.js';

describe('resolveDatumFacePick', () => {
  it('returns create when a body pick resolves to a face', () => {
    const bodies = new Map([['body-1', {}]]);

    expect(resolveDatumFacePick('body-1', bodies, {
      bodyId: 'body-1',
      geometryId: 'geom-1',
      faceIndex: 4,
    })).toEqual({
      kind: 'create',
      bodyId: 'body-1',
      geometryId: 'geom-1',
      faceIndex: 4,
    });
  });

  it('returns error when a body pick has no resolved face', () => {
    const bodies = new Map([['body-1', {}]]);

    expect(resolveDatumFacePick('body-1', bodies, { bodyId: 'body-1' })).toEqual({
      kind: 'error',
      message: 'No face detected — click directly on a geometry surface',
    });
  });

  it('ignores non-body picks', () => {
    const bodies = new Map([['body-1', {}]]);

    expect(resolveDatumFacePick('datum-1', bodies, {
      bodyId: 'datum-1',
      geometryId: 'geom-1',
      faceIndex: 1,
    })).toEqual({
      kind: 'ignore',
    });
    expect(resolveDatumFacePick(null, bodies, { geometryId: 'geom-1', faceIndex: 1 })).toEqual({
      kind: 'ignore',
    });
  });
});
