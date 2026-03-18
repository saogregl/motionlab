import { create } from 'zustand';

export type ToolMode = 'select' | 'create-datum' | 'create-joint';

export interface ToolModeState {
  activeMode: ToolMode;
  setMode: (mode: ToolMode) => void;
}

export const useToolModeStore = create<ToolModeState>()((set) => ({
  activeMode: 'select',
  setMode: (mode) => set({ activeMode: mode }),
}));
