import { create } from 'zustand';

export type SelectionFilter = Set<'body' | 'datum' | 'joint' | 'geometry' | 'load'> | null;

export interface SelectionState {
  selectedIds: Set<string>;
  hoveredId: string | null;
  lastSelectedId: string | null;
  selectionFilter: SelectionFilter;

  select: (id: string) => void;
  deselect: (id: string) => void;
  toggleSelect: (id: string) => void;
  addToSelection: (id: string) => void;
  clearSelection: () => void;
  setSelection: (ids: string[]) => void;
  selectRange: (id: string, orderedIds: string[]) => void;
  selectAll: (allIds: string[]) => void;
  setSelectionFilter: (filter: SelectionFilter) => void;
  setHovered: (id: string | null) => void;
}

export const useSelectionStore = create<SelectionState>()((set) => ({
  selectedIds: new Set<string>(),
  hoveredId: null,
  lastSelectedId: null,
  selectionFilter: null,

  select: (id) => set({ selectedIds: new Set([id]), lastSelectedId: id }),

  deselect: (id) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      next.delete(id);
      return { selectedIds: next };
    }),

  toggleSelect: (id) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      if (next.has(id)) {
        next.delete(id);
        return { selectedIds: next };
      } else {
        next.add(id);
        return { selectedIds: next, lastSelectedId: id };
      }
    }),

  addToSelection: (id) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      next.add(id);
      return { selectedIds: next, lastSelectedId: id };
    }),

  clearSelection: () => set({ selectedIds: new Set<string>(), lastSelectedId: null }),

  setSelection: (ids) =>
    set({
      selectedIds: new Set(ids),
      lastSelectedId: ids.length > 0 ? ids[ids.length - 1] : null,
    }),

  selectRange: (id, orderedIds) =>
    set((state) => {
      const anchor = state.lastSelectedId;
      if (!anchor) return { selectedIds: new Set([id]), lastSelectedId: id };

      const anchorIdx = orderedIds.indexOf(anchor);
      const targetIdx = orderedIds.indexOf(id);
      if (anchorIdx === -1 || targetIdx === -1) {
        return { selectedIds: new Set([id]), lastSelectedId: id };
      }

      const start = Math.min(anchorIdx, targetIdx);
      const end = Math.max(anchorIdx, targetIdx);
      const next = new Set(state.selectedIds);
      for (let i = start; i <= end; i++) {
        next.add(orderedIds[i]);
      }
      return { selectedIds: next, lastSelectedId: id };
    }),

  selectAll: (allIds) =>
    set({
      selectedIds: new Set(allIds),
      lastSelectedId: allIds.length > 0 ? allIds[allIds.length - 1] : null,
    }),

  setSelectionFilter: (filter) => set({ selectionFilter: filter }),

  setHovered: (id) =>
    set((state) => {
      if (state.hoveredId === id) return state;
      return { hoveredId: id };
    }),
}));
