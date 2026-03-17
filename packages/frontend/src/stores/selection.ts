import { create } from 'zustand';

export interface SelectionState {
  selectedIds: Set<string>;
  hoveredId: string | null;

  select: (id: string) => void;
  deselect: (id: string) => void;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  setSelection: (ids: string[]) => void;
  setHovered: (id: string | null) => void;
}

export const useSelectionStore = create<SelectionState>()((set) => ({
  selectedIds: new Set<string>(),
  hoveredId: null,

  select: (id) => set({ selectedIds: new Set([id]) }),

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
      } else {
        next.add(id);
      }
      return { selectedIds: next };
    }),

  clearSelection: () => set({ selectedIds: new Set<string>() }),

  setSelection: (ids) => set({ selectedIds: new Set(ids) }),

  setHovered: (id) =>
    set((state) => {
      if (state.hoveredId === id) return state;
      return { hoveredId: id };
    }),
}));
