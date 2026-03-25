import { create } from 'zustand';

import { useToolModeStore } from './tool-mode.js';

export type Workspace = 'build' | 'results';

interface UILayoutState {
  // Workspace
  activeWorkspace: Workspace;
  setActiveWorkspace(workspace: Workspace): void;

  // Build panel state
  bottomDockExpanded: boolean;
  bottomDockActiveTab: string;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  rightPanelAutoShow: boolean;
  leftPanelWidth: number;
  rightPanelWidth: number;
  setBottomDockExpanded(expanded: boolean): void;
  setBottomDockActiveTab(tab: string): void;
  toggleChartPanel(): void;
  toggleLeftPanel(): void;
  toggleRightPanel(): void;
  setRightPanelOpen(open: boolean): void;
  setLeftPanelWidth(width: number): void;
  setRightPanelWidth(width: number): void;

  // Results panel state (independent of Build)
  resultsLeftPanelOpen: boolean;
  resultsLeftPanelWidth: number;
  setResultsLeftPanelWidth(width: number): void;
  toggleResultsLeftPanel(): void;

  // Results bottom dock state
  resultsBottomDockExpanded: boolean;
  resultsBottomDockActiveTab: string;
  setResultsBottomDockExpanded(expanded: boolean): void;
  setResultsBottomDockActiveTab(tab: string): void;
}

const PANEL_MIN_W = 240;
const PANEL_MAX_W = 420;

function clampWidth(w: number): number {
  return Math.round(Math.min(PANEL_MAX_W, Math.max(PANEL_MIN_W, w)));
}

export const useUILayoutStore = create<UILayoutState>()((set, get) => ({
  // Workspace
  activeWorkspace: 'build',
  setActiveWorkspace: (workspace) => {
    if (get().activeWorkspace === workspace) return;
    set({ activeWorkspace: workspace });
    if (workspace === 'results') {
      useToolModeStore.getState().setMode('select');
      useToolModeStore.getState().setGizmoMode('off');
    }
  },

  // Build panel state
  bottomDockExpanded: false,
  bottomDockActiveTab: 'timeline',
  leftPanelOpen: true,
  rightPanelOpen: false,
  rightPanelAutoShow: true,
  leftPanelWidth: 288,
  rightPanelWidth: 288,
  setBottomDockExpanded: (expanded) => set({ bottomDockExpanded: expanded }),
  setBottomDockActiveTab: (tab) => set({ bottomDockActiveTab: tab }),
  toggleChartPanel: () => {
    const { resultsBottomDockActiveTab, resultsBottomDockExpanded } = get();
    if (resultsBottomDockActiveTab === 'charts' && resultsBottomDockExpanded) {
      set({ resultsBottomDockExpanded: false });
    } else {
      set({ resultsBottomDockActiveTab: 'charts', resultsBottomDockExpanded: true });
    }
  },
  toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
  toggleRightPanel: () => {
    const { rightPanelOpen, rightPanelAutoShow } = get();
    if (rightPanelOpen) {
      // Closing: also disable auto-show so future selections don't re-open
      set({ rightPanelOpen: false, rightPanelAutoShow: false });
    } else if (!rightPanelAutoShow) {
      // Re-opening after manual close: re-enable auto-show
      set({ rightPanelOpen: true, rightPanelAutoShow: true });
    } else {
      // Auto-show is on but panel is closed: just open it
      set({ rightPanelOpen: true });
    }
  },
  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
  setLeftPanelWidth: (width) => set({ leftPanelWidth: clampWidth(width) }),
  setRightPanelWidth: (width) => set({ rightPanelWidth: clampWidth(width) }),

  // Results panel state
  resultsLeftPanelOpen: true,
  resultsLeftPanelWidth: 288,
  setResultsLeftPanelWidth: (width) => set({ resultsLeftPanelWidth: clampWidth(width) }),
  toggleResultsLeftPanel: () => set((s) => ({ resultsLeftPanelOpen: !s.resultsLeftPanelOpen })),

  // Results bottom dock state
  resultsBottomDockExpanded: true,
  resultsBottomDockActiveTab: 'charts',
  setResultsBottomDockExpanded: (expanded) => set({ resultsBottomDockExpanded: expanded }),
  setResultsBottomDockActiveTab: (tab) => set({ resultsBottomDockActiveTab: tab }),
}));
