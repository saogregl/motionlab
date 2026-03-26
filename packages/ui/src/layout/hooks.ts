import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

import { useLayoutManager } from './layout-context';
import type { PanelSide, ViewportInsets } from './types';

/**
 * Returns a ref callback to attach to the layout root element (main-area div).
 * The LayoutManager writes CSS custom properties to this element.
 * Used once in AppShell.
 */
export function useLayoutRoot(): React.RefCallback<HTMLElement> {
  const manager = useLayoutManager();
  return useCallback(
    (el: HTMLElement | null) => {
      if (el) manager.mount(el);
      else manager.unmount();
    },
    [manager],
  );
}

/**
 * Register a panel slot with the layout engine. Automatically updates
 * derived CSS variables when size/open/instant change.
 *
 * @param id     Unique panel identifier (e.g. 'panel-left', 'panel-bottom')
 * @param side   Which edge the panel is on
 * @param size   Width (left/right) or height (bottom) in px
 * @param open   Whether the panel is visible
 * @param instant When true, CSS transitions are suppressed (resize drag)
 */
export function useLayoutSlot(
  id: string,
  side: PanelSide,
  size: number,
  open: boolean,
  instant = false,
): void {
  const manager = useLayoutManager();
  const idRef = useRef(id);
  idRef.current = id;

  useEffect(() => {
    manager.updateSlot({ id, side, size, open, instant });
  }, [manager, id, side, size, open, instant]);

  useEffect(() => {
    return () => manager.removeSlot(idRef.current);
  }, [manager]);
}

/**
 * Subscribe to computed viewport insets. Uses useSyncExternalStore so only
 * the subscribing component re-renders — not the whole tree.
 *
 * Use this in R3F GizmoHelper or any JS consumer that needs pixel values.
 */
export function useViewportInsets(): ViewportInsets {
  const manager = useLayoutManager();
  return useSyncExternalStore(manager.subscribe, manager.getSnapshot);
}
