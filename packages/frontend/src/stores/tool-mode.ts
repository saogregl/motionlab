import { create } from 'zustand';

export type ToolMode = 'select' | 'create-datum' | 'create-joint';

export type GizmoMode = 'translate' | 'rotate' | 'off';

export interface ToolModeState {
  activeMode: ToolMode;
  gizmoMode: GizmoMode;
  setMode: (mode: ToolMode) => void;
  setGizmoMode: (mode: GizmoMode) => void;
}

export const useToolModeStore = create<ToolModeState>()((set) => ({
  activeMode: 'select',
  gizmoMode: 'off',
  setMode: (mode) => set({ activeMode: mode }),
  setGizmoMode: (mode) => set({ gizmoMode: mode }),
}));
