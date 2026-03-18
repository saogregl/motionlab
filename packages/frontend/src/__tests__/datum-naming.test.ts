import { describe, expect, it } from 'vitest';

import { nextDatumName } from '../utils/datum-naming.js';

describe('nextDatumName', () => {
  it('returns "Datum 1" for an empty map', () => {
    expect(nextDatumName(new Map())).toBe('Datum 1');
  });

  it('returns sequential names', () => {
    const datums = new Map([
      ['a', { name: 'Datum 1' }],
      ['b', { name: 'Datum 2' }],
    ]);
    expect(nextDatumName(datums)).toBe('Datum 3');
  });

  it('ignores non-matching names', () => {
    const datums = new Map([
      ['a', { name: 'Origin' }],
      ['b', { name: 'My Point' }],
    ]);
    expect(nextDatumName(datums)).toBe('Datum 1');
  });

  it('finds the max even with gaps', () => {
    const datums = new Map([
      ['a', { name: 'Datum 1' }],
      ['b', { name: 'Datum 5' }],
    ]);
    expect(nextDatumName(datums)).toBe('Datum 6');
  });

  it('handles mixed matching and non-matching names', () => {
    const datums = new Map([
      ['a', { name: 'Datum 3' }],
      ['b', { name: 'Custom Name' }],
      ['c', { name: 'Datum 1' }],
    ]);
    expect(nextDatumName(datums)).toBe('Datum 4');
  });
});
