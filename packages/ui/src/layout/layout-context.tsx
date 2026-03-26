import { createContext, useContext, useRef, type ReactNode } from 'react';

import { LayoutManager } from './layout-manager';

const LayoutContext = createContext<LayoutManager | null>(null);

interface LayoutProviderProps {
  children: ReactNode;
  /** Panel float inset in px (default: 6, matches --panel-float-inset) */
  floatInset?: number;
}

function LayoutProvider({ children, floatInset = 6 }: LayoutProviderProps) {
  const managerRef = useRef<LayoutManager | null>(null);
  if (!managerRef.current) {
    managerRef.current = new LayoutManager(floatInset);
  }
  return <LayoutContext.Provider value={managerRef.current}>{children}</LayoutContext.Provider>;
}

function useLayoutManager(): LayoutManager {
  const manager = useContext(LayoutContext);
  if (!manager) throw new Error('useLayoutManager must be used within <LayoutProvider>');
  return manager;
}

export { LayoutContext, LayoutProvider, useLayoutManager };
