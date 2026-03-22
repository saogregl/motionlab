import { create } from 'zustand';

export type DialogId = 'sim-settings' | 'shortcuts' | 'about' | 'missing-assets';

interface DialogState {
  openDialog: DialogId | null;
  open: (id: DialogId) => void;
  close: () => void;
}

export const useDialogStore = create<DialogState>()((set) => ({
  openDialog: null,
  open: (id) => set({ openDialog: id }),
  close: () => set({ openDialog: null }),
}));
