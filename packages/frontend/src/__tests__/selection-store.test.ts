import { beforeEach, describe, expect, it } from 'vitest';

import { useSelectionStore } from '../stores/selection.js';

describe('Selection store', () => {
  beforeEach(() => {
    useSelectionStore.setState({
      selectedIds: new Set(),
      hoveredId: null,
      lastSelectedId: null,
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
});
