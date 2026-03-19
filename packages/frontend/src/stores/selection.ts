import { create } from 'zustand';

export interface SelectionState {
  selectedIds: Set<string>;
  hoveredId: string | null;
  lastSelectedId: string | null;

  select: (id: string) => void;
  deselect: (id: string) => void;
  toggleSelect: (id: string) => void;
  addToSelection: (id: string) => void;
  clearSelection: () => void;
  setSelection: (ids: string[]) => void;
  setHovered: (id: string | null) => void;
}

export const useSelectionStore = create<SelectionState>()((set) => ({
  selectedIds: new Set<string>(),
  hoveredId: null,
  lastSelectedId: null,

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

  setHovered: (id) =>
    set((state) => {
      if (state.hoveredId === id) return state;
      return { hoveredId: id };
    }),
}));
