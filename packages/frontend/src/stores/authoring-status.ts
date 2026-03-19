import { create } from 'zustand';

interface AuthoringStatusState {
  message: string | null;
  setMessage: (message: string | null) => void;
  clearMessage: () => void;
}

export const useAuthoringStatusStore = create<AuthoringStatusState>()((set) => ({
  message: null,
  setMessage: (message) => set({ message }),
  clearMessage: () => set({ message: null }),
}));
