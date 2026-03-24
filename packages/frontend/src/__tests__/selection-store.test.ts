import { beforeEach, describe, expect, it } from 'vitest';

import { useSelectionStore } from '../stores/selection.js';

describe('Selection store', () => {
  beforeEach(() => {
    useSelectionStore.setState({
      selectedIds: new Set(),
      hoveredId: null,
      lastSelectedId: null,
      selectionFilter: null,
    });
  });

  it('initial state', () => {
    const s = useSelectionStore.getState();
    expect(s.selectedIds.size).toBe(0);
    expect(s.hoveredId).toBeNull();
    expect(s.lastSelectedId).toBeNull();
  });

  it('select replaces selection', () => {
    useSelectionStore.getState().select('a');
    const s = useSelectionStore.getState();
    expect(s.selectedIds).toEqual(new Set(['a']));
    expect(s.lastSelectedId).toBe('a');
  });

  it('deselect removes ID', () => {
    useSelectionStore.getState().select('a');
    useSelectionStore.getState().addToSelection('b');
    useSelectionStore.getState().deselect('a');
    expect(useSelectionStore.getState().selectedIds).toEqual(new Set(['b']));
  });

  it('toggleSelect adds', () => {
    useSelectionStore.getState().toggleSelect('a');
    const s = useSelectionStore.getState();
    expect(s.selectedIds.has('a')).toBe(true);
    expect(s.lastSelectedId).toBe('a');
  });

  it('toggleSelect removes', () => {
    useSelectionStore.getState().select('a');
    useSelectionStore.getState().toggleSelect('a');
    expect(useSelectionStore.getState().selectedIds.has('a')).toBe(false);
  });

  it('addToSelection adds without clearing', () => {
    useSelectionStore.getState().select('a');
    useSelectionStore.getState().addToSelection('b');
    expect(useSelectionStore.getState().selectedIds).toEqual(new Set(['a', 'b']));
    expect(useSelectionStore.getState().lastSelectedId).toBe('b');
  });

  it('clearSelection empties set and nulls lastSelectedId', () => {
    useSelectionStore.getState().select('a');
    useSelectionStore.getState().clearSelection();
    const s = useSelectionStore.getState();
    expect(s.selectedIds.size).toBe(0);
    expect(s.lastSelectedId).toBeNull();
  });

  it('setSelection replaces set with lastSelectedId as last element', () => {
    useSelectionStore.getState().setSelection(['a', 'b', 'c']);
    const s = useSelectionStore.getState();
    expect(s.selectedIds).toEqual(new Set(['a', 'b', 'c']));
    expect(s.lastSelectedId).toBe('c');
  });

  it('setHovered updates hoveredId and returns same ref for same value', () => {
    useSelectionStore.getState().setHovered('x');
    expect(useSelectionStore.getState().hoveredId).toBe('x');

    const ref = useSelectionStore.getState();
    useSelectionStore.getState().setHovered('x');
    expect(useSelectionStore.getState()).toBe(ref);
  });

  // --- selectRange (Epic 11) ---

  describe('selectRange', () => {
    const ordered = ['a', 'b', 'c', 'd', 'e'];

    it('selects range from anchor to target (forward)', () => {
      useSelectionStore.getState().select('b'); // anchor = 'b'
      useSelectionStore.getState().selectRange('d', ordered);
      const s = useSelectionStore.getState();
      expect(s.selectedIds).toEqual(new Set(['b', 'c', 'd']));
      expect(s.lastSelectedId).toBe('d');
    });

    it('selects range from anchor to target (backward)', () => {
      useSelectionStore.getState().select('d'); // anchor = 'd'
      useSelectionStore.getState().selectRange('b', ordered);
      const s = useSelectionStore.getState();
      expect(s.selectedIds).toEqual(new Set(['b', 'c', 'd']));
      expect(s.lastSelectedId).toBe('b');
    });

    it('adds range to existing selection', () => {
      useSelectionStore.getState().select('a');
      useSelectionStore.getState().addToSelection('c'); // anchor = 'c'
      useSelectionStore.getState().selectRange('e', ordered);
      const s = useSelectionStore.getState();
      expect(s.selectedIds).toEqual(new Set(['a', 'c', 'd', 'e']));
    });

    it('falls back to single select when no anchor', () => {
      // lastSelectedId is null
      useSelectionStore.getState().selectRange('c', ordered);
      const s = useSelectionStore.getState();
      expect(s.selectedIds).toEqual(new Set(['c']));
      expect(s.lastSelectedId).toBe('c');
    });

    it('falls back to single select when anchor not in ordered list', () => {
      useSelectionStore.getState().select('z'); // anchor = 'z', not in ordered
      useSelectionStore.getState().selectRange('c', ordered);
      const s = useSelectionStore.getState();
      expect(s.selectedIds).toEqual(new Set(['c']));
    });

    it('falls back to single select when target not in ordered list', () => {
      useSelectionStore.getState().select('b');
      useSelectionStore.getState().selectRange('z', ordered);
      const s = useSelectionStore.getState();
      expect(s.selectedIds).toEqual(new Set(['z']));
    });

    it('handles same anchor and target', () => {
      useSelectionStore.getState().select('c');
      useSelectionStore.getState().selectRange('c', ordered);
      const s = useSelectionStore.getState();
      expect(s.selectedIds.has('c')).toBe(true);
    });
  });

  // --- selectAll (Epic 11) ---

  describe('selectAll', () => {
    it('selects all provided IDs', () => {
      useSelectionStore.getState().selectAll(['a', 'b', 'c']);
      const s = useSelectionStore.getState();
      expect(s.selectedIds).toEqual(new Set(['a', 'b', 'c']));
      expect(s.lastSelectedId).toBe('c');
    });

    it('handles empty list', () => {
      useSelectionStore.getState().select('a');
      useSelectionStore.getState().selectAll([]);
      const s = useSelectionStore.getState();
      expect(s.selectedIds.size).toBe(0);
      expect(s.lastSelectedId).toBeNull();
    });

    it('replaces existing selection', () => {
      useSelectionStore.getState().select('x');
      useSelectionStore.getState().selectAll(['a', 'b']);
      expect(useSelectionStore.getState().selectedIds).toEqual(new Set(['a', 'b']));
    });
  });

  // --- selectionFilter (Epic 11) ---

  describe('selectionFilter', () => {
    it('defaults to null (no filter)', () => {
      expect(useSelectionStore.getState().selectionFilter).toBeNull();
    });

    it('setSelectionFilter stores the filter', () => {
      const filter = new Set(['body', 'datum', 'actuator'] as const);
      useSelectionStore.getState().setSelectionFilter(filter);
      expect(useSelectionStore.getState().selectionFilter).toBe(filter);
    });

    it('setSelectionFilter to null clears filter', () => {
      useSelectionStore.getState().setSelectionFilter(new Set(['joint'] as const));
      useSelectionStore.getState().setSelectionFilter(null);
      expect(useSelectionStore.getState().selectionFilter).toBeNull();
    });
  });
});
