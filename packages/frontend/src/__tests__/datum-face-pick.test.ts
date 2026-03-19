import { describe, expect, it } from 'vitest';

import { resolveDatumFacePick } from '../utils/datum-face-pick.js';

describe('resolveDatumFacePick', () => {
  it('returns create when a body pick resolves to a face', () => {
    const bodies = new Map([['body-1', {}]]);

    expect(resolveDatumFacePick('body-1', bodies, { faceIndex: 4 })).toEqual({
      kind: 'create',
      bodyId: 'body-1',
      faceIndex: 4,
    });
  });

  it('returns error when a body pick has no resolved face', () => {
    const bodies = new Map([['body-1', {}]]);

    expect(resolveDatumFacePick('body-1', bodies, {})).toEqual({
      kind: 'error',
      message: 'Face-aware datum creation unavailable for this pick',
    });
  });

  it('ignores non-body picks', () => {
    const bodies = new Map([['body-1', {}]]);

    expect(resolveDatumFacePick('datum-1', bodies, { faceIndex: 1 })).toEqual({
      kind: 'ignore',
    });
    expect(resolveDatumFacePick(null, bodies, { faceIndex: 1 })).toEqual({
      kind: 'ignore',
    });
  });
});
