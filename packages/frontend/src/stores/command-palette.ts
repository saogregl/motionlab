import { create } from 'zustand';

interface CommandPaletteState {
  isOpen: boolean;
  openPalette: () => void;
  closePalette: () => void;
  setOpen: (open: boolean) => void;
  togglePalette: () => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>()((set) => ({
  isOpen: false,
  openPalette: () => set({ isOpen: true }),
  closePalette: () => set({ isOpen: false }),
  setOpen: (open) => set({ isOpen: open }),
  togglePalette: () => set((state) => ({ isOpen: !state.isOpen })),
}));
