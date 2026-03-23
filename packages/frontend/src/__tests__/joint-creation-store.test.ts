import { beforeEach, describe, expect, it } from 'vitest';

import {
  type DatumAlignment,
  useJointCreationStore,
} from '../stores/joint-creation.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAlignment(overrides?: Partial<DatumAlignment>): DatumAlignment {
  return {
    kind: 'coaxial',
    recommendedTypes: ['revolute', 'cylindrical'],
    distance: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Joint creation store', () => {
  beforeEach(() => {
    useJointCreationStore.getState().exitMode();
  });

  // --- Initial state ---

  it('initial state is idle with all fields null/empty/false', () => {
    const s = useJointCreationStore.getState();
    expect(s.step).toBe('idle');
    expect(s.parentDatumId).toBeNull();
    expect(s.childDatumId).toBeNull();
    expect(s.preselectedJointType).toBeNull();
    expect(s.previewJointType).toBeNull();
    expect(s.selectedJointType).toBeNull();
    expect(s.recommendedTypes).toEqual([]);
    expect(s.alignmentKind).toBeNull();
    expect(s.creatingDatum).toBe(false);
  });

  // --- startCreation ---

  it('startCreation transitions to pick-parent and clears all fields', () => {
    // Dirty the state first
    const store = useJointCreationStore.getState();
    store.startCreation();
    store.setParentDatum('p1');
    store.setChildDatum('c1', makeAlignment());

    // Now start fresh
    useJointCreationStore.getState().startCreation();
    const s = useJointCreationStore.getState();
    expect(s.step).toBe('pick-parent');
    expect(s.parentDatumId).toBeNull();
    expect(s.childDatumId).toBeNull();
    expect(s.previewJointType).toBeNull();
    expect(s.selectedJointType).toBeNull();
    expect(s.recommendedTypes).toEqual([]);
    expect(s.alignmentKind).toBeNull();
    expect(s.creatingDatum).toBe(false);
  });

  // --- setParentDatum ---

  it('setParentDatum transitions from pick-parent to pick-child and sets parentDatumId', () => {
    useJointCreationStore.getState().startCreation();
    useJointCreationStore.getState().setParentDatum('datum-parent');
    const s = useJointCreationStore.getState();
    expect(s.step).toBe('pick-child');
    expect(s.parentDatumId).toBe('datum-parent');
  });

  // --- setChildDatum without alignment ---

  it('setChildDatum without alignment transitions to select-type with no recommendations', () => {
    useJointCreationStore.getState().startCreation();
    useJointCreationStore.getState().setParentDatum('p1');
    useJointCreationStore.getState().setChildDatum('c1');
    const s = useJointCreationStore.getState();
    expect(s.step).toBe('select-type');
    expect(s.childDatumId).toBe('c1');
    expect(s.selectedJointType).toBeNull();
    expect(s.recommendedTypes).toEqual([]);
    expect(s.alignmentKind).toBeNull();
  });

  // --- setChildDatum with alignment ---

  it('setChildDatum with alignment populates recommendedTypes and auto-selects first', () => {
    useJointCreationStore.getState().startCreation();
    useJointCreationStore.getState().setParentDatum('p1');
    const alignment = makeAlignment({
      kind: 'coplanar',
      recommendedTypes: ['planar', 'fixed'],
    });
    useJointCreationStore.getState().setChildDatum('c1', alignment);
    const s = useJointCreationStore.getState();
    expect(s.step).toBe('select-type');
    expect(s.childDatumId).toBe('c1');
    expect(s.recommendedTypes).toEqual(['planar', 'fixed']);
    expect(s.alignmentKind).toBe('coplanar');
    expect(s.selectedJointType).toBe('planar');
    expect(s.previewJointType).toBeNull();
  });

  // --- setChildDatum with preselectedJointType ---

  it('preselectedJointType takes priority over recommendedTypes[0] for selectedJointType', () => {
    useJointCreationStore.getState().startCreation();
    useJointCreationStore.getState().setPreselectedJointType('prismatic');
    useJointCreationStore.getState().setParentDatum('p1');
    const alignment = makeAlignment({
      recommendedTypes: ['revolute', 'cylindrical'],
    });
    useJointCreationStore.getState().setChildDatum('c1', alignment);
    const s = useJointCreationStore.getState();
    expect(s.selectedJointType).toBe('prismatic');
    expect(s.recommendedTypes).toEqual(['revolute', 'cylindrical']);
  });

  // --- cancel: single-level undo ---

  it('cancel from select-type goes to pick-child, clears child/alignment/recommendations, keeps parent', () => {
    useJointCreationStore.getState().startCreation();
    useJointCreationStore.getState().setParentDatum('p1');
    useJointCreationStore.getState().setChildDatum('c1', makeAlignment());

    useJointCreationStore.getState().cancel();
    const s = useJointCreationStore.getState();
    expect(s.step).toBe('pick-child');
    expect(s.parentDatumId).toBe('p1');
    expect(s.childDatumId).toBeNull();
    expect(s.recommendedTypes).toEqual([]);
    expect(s.alignmentKind).toBeNull();
    expect(s.selectedJointType).toBeNull();
    expect(s.previewJointType).toBeNull();
  });

  it('cancel from pick-child goes to pick-parent and clears parent', () => {
    useJointCreationStore.getState().startCreation();
    useJointCreationStore.getState().setParentDatum('p1');

    useJointCreationStore.getState().cancel();
    const s = useJointCreationStore.getState();
    expect(s.step).toBe('pick-parent');
    expect(s.parentDatumId).toBeNull();
  });

  it('cancel from pick-parent is no-op', () => {
    useJointCreationStore.getState().startCreation();
    expect(useJointCreationStore.getState().step).toBe('pick-parent');

    useJointCreationStore.getState().cancel();
    expect(useJointCreationStore.getState().step).toBe('pick-parent');
  });

  // --- reset ---

  it('reset goes to pick-parent and clears everything including preselectedJointType', () => {
    useJointCreationStore.getState().startCreation();
    useJointCreationStore.getState().setPreselectedJointType('revolute');
    useJointCreationStore.getState().setParentDatum('p1');
    useJointCreationStore.getState().setChildDatum('c1', makeAlignment());
    useJointCreationStore.getState().setCreatingDatum(true);

    useJointCreationStore.getState().reset();
    const s = useJointCreationStore.getState();
    expect(s.step).toBe('pick-parent');
    expect(s.parentDatumId).toBeNull();
    expect(s.childDatumId).toBeNull();
    expect(s.preselectedJointType).toBeNull();
    expect(s.previewJointType).toBeNull();
    expect(s.selectedJointType).toBeNull();
    expect(s.recommendedTypes).toEqual([]);
    expect(s.alignmentKind).toBeNull();
    expect(s.creatingDatum).toBe(false);
  });

  // --- exitMode ---

  it('exitMode goes to idle and clears everything', () => {
    useJointCreationStore.getState().startCreation();
    useJointCreationStore.getState().setParentDatum('p1');
    useJointCreationStore.getState().setChildDatum('c1', makeAlignment());
    useJointCreationStore.getState().setPreselectedJointType('fixed');
    useJointCreationStore.getState().setCreatingDatum(true);

    useJointCreationStore.getState().exitMode();
    const s = useJointCreationStore.getState();
    expect(s.step).toBe('idle');
    expect(s.parentDatumId).toBeNull();
    expect(s.childDatumId).toBeNull();
    expect(s.preselectedJointType).toBeNull();
    expect(s.previewJointType).toBeNull();
    expect(s.selectedJointType).toBeNull();
    expect(s.recommendedTypes).toEqual([]);
    expect(s.alignmentKind).toBeNull();
    expect(s.creatingDatum).toBe(false);
  });

  // --- setPreviewJointType ---

  it('setPreviewJointType sets previewJointType field', () => {
    useJointCreationStore.getState().setPreviewJointType('spherical');
    expect(useJointCreationStore.getState().previewJointType).toBe('spherical');
  });

  it('setPreviewJointType can be set to null', () => {
    useJointCreationStore.getState().setPreviewJointType('spherical');
    useJointCreationStore.getState().setPreviewJointType(null);
    expect(useJointCreationStore.getState().previewJointType).toBeNull();
  });

  // --- selectJointType ---

  it('selectJointType sets selectedJointType field', () => {
    useJointCreationStore.getState().selectJointType('prismatic');
    expect(useJointCreationStore.getState().selectedJointType).toBe('prismatic');
  });

  // --- setCreatingDatum ---

  it('setCreatingDatum sets creatingDatum flag', () => {
    expect(useJointCreationStore.getState().creatingDatum).toBe(false);
    useJointCreationStore.getState().setCreatingDatum(true);
    expect(useJointCreationStore.getState().creatingDatum).toBe(true);
    useJointCreationStore.getState().setCreatingDatum(false);
    expect(useJointCreationStore.getState().creatingDatum).toBe(false);
  });

  // --- Full happy path ---

  it('full happy path: startCreation → parent → child(alignment) → verify auto-select → reset → pick-parent', () => {
    // 1. Enter creation mode
    useJointCreationStore.getState().startCreation();
    expect(useJointCreationStore.getState().step).toBe('pick-parent');

    // 2. Pick parent datum
    useJointCreationStore.getState().setParentDatum('datum-parent');
    expect(useJointCreationStore.getState().step).toBe('pick-child');
    expect(useJointCreationStore.getState().parentDatumId).toBe('datum-parent');

    // 3. Pick child datum with alignment info
    const alignment = makeAlignment({
      kind: 'coincident',
      recommendedTypes: ['fixed', 'revolute', 'spherical'],
      distance: 0.001,
    });
    useJointCreationStore.getState().setChildDatum('datum-child', alignment);
    const afterChild = useJointCreationStore.getState();
    expect(afterChild.step).toBe('select-type');
    expect(afterChild.childDatumId).toBe('datum-child');
    expect(afterChild.alignmentKind).toBe('coincident');
    expect(afterChild.recommendedTypes).toEqual(['fixed', 'revolute', 'spherical']);
    // Auto-selected first recommended type
    expect(afterChild.selectedJointType).toBe('fixed');

    // 4. Reset for chaining (simulate successful creation)
    useJointCreationStore.getState().reset();
    const afterReset = useJointCreationStore.getState();
    expect(afterReset.step).toBe('pick-parent');
    expect(afterReset.parentDatumId).toBeNull();
    expect(afterReset.childDatumId).toBeNull();
    expect(afterReset.selectedJointType).toBeNull();
    expect(afterReset.recommendedTypes).toEqual([]);
    expect(afterReset.alignmentKind).toBeNull();
  });
});
