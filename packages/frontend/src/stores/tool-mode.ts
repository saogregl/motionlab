import { create } from 'zustand';

export type ToolMode = 'select' | 'create-datum' | 'create-joint' | 'create-load';

export type GizmoMode = 'translate' | 'rotate' | 'off';

export type GizmoSpace = 'local' | 'world';

export interface ToolModeState {
  activeMode: ToolMode;
  gizmoMode: GizmoMode;

  /** Configured translation snap in meters. Applied when Shift is held. */
  translationSnap: number;
  /** Configured rotation snap in radians. Applied when Shift is held. */
  rotationSnap: number;
  /** Gizmo coordinate frame. */
  gizmoSpace: GizmoSpace;
  /** True when user has explicitly toggled the space (suppresses auto-default). */
  gizmoSpaceOverride: boolean;

  /** Whether datum frames are visible in the viewport. */
  datumsVisible: boolean;
  /** Whether joint anchors and link lines are visible in the viewport. */
  jointsVisible: boolean;
  /** Whether the reference grid is visible in the viewport. */
  gridVisible: boolean;

  setMode: (mode: ToolMode) => void;
  setGizmoMode: (mode: GizmoMode) => void;
  setTranslationSnap: (value: number) => void;
  setRotationSnap: (value: number) => void;
  setGizmoSpace: (space: GizmoSpace) => void;
  resetGizmoSpaceOverride: () => void;
  setDatumsVisible: (visible: boolean) => void;
  setJointsVisible: (visible: boolean) => void;
  setGridVisible: (visible: boolean) => void;
}

export const useToolModeStore = create<ToolModeState>()((set) => ({
  activeMode: 'select',
  gizmoMode: 'off',
  translationSnap: 0.01,
  rotationSnap: Math.PI / 12,
  gizmoSpace: 'world' as GizmoSpace,
  gizmoSpaceOverride: false,
  datumsVisible: true,
  jointsVisible: true,
  gridVisible: true,

  setMode: (mode) => set({ activeMode: mode }),
  setGizmoMode: (mode) => set({ gizmoMode: mode }),
  setTranslationSnap: (value) => set({ translationSnap: value }),
  setRotationSnap: (value) => set({ rotationSnap: value }),
  setGizmoSpace: (space) => set({ gizmoSpace: space, gizmoSpaceOverride: true }),
  resetGizmoSpaceOverride: () => set({ gizmoSpaceOverride: false }),
  setDatumsVisible: (visible) => set({ datumsVisible: visible }),
  setJointsVisible: (visible) => set({ jointsVisible: visible }),
  setGridVisible: (visible) => set({ gridVisible: visible }),
}));
