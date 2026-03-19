import { create } from 'zustand';

interface UILayoutState {
  bottomDockExpanded: boolean;
  bottomDockActiveTab: string;
  setBottomDockExpanded(expanded: boolean): void;
  setBottomDockActiveTab(tab: string): void;
  toggleChartPanel(): void;
}

export const useUILayoutStore = create<UILayoutState>()((set, get) => ({
  bottomDockExpanded: true,
  bottomDockActiveTab: 'timeline',
  setBottomDockExpanded: (expanded) => set({ bottomDockExpanded: expanded }),
  setBottomDockActiveTab: (tab) => set({ bottomDockActiveTab: tab }),
  toggleChartPanel: () => {
    const { bottomDockActiveTab, bottomDockExpanded } = get();
    if (bottomDockActiveTab === 'charts' && bottomDockExpanded) {
      set({ bottomDockExpanded: false });
    } else {
      set({ bottomDockActiveTab: 'charts', bottomDockExpanded: true });
    }
  },
}));
