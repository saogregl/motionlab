import { create } from 'zustand';

export interface VisibilityState {
  hiddenIds: Set<string>;

  toggleVisibility: (id: string) => void;
  hide: (id: string) => void;
  show: (id: string) => void;
  /** Hide everything except the given entity (and its children when provided). */
  isolate: (id: string, allIds: string[]) => void;
  showAll: () => void;
  isHidden: (id: string) => boolean;
}

export const useVisibilityStore = create<VisibilityState>()((set, get) => ({
  hiddenIds: new Set<string>(),

  toggleVisibility: (id) =>
    set((state) => {
      const next = new Set(state.hiddenIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { hiddenIds: next };
    }),

  hide: (id) =>
    set((state) => {
      const next = new Set(state.hiddenIds);
      next.add(id);
      return { hiddenIds: next };
    }),

  show: (id) =>
    set((state) => {
      const next = new Set(state.hiddenIds);
      next.delete(id);
      return { hiddenIds: next };
    }),

  isolate: (id, allIds) =>
    set(() => {
      const next = new Set<string>();
      for (const otherId of allIds) {
        if (otherId !== id) {
          next.add(otherId);
        }
      }
      return { hiddenIds: next };
    }),

  showAll: () => set({ hiddenIds: new Set<string>() }),

  isHidden: (id) => get().hiddenIds.has(id),
}));
