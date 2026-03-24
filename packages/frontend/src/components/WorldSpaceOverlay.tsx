import { useEffect, useRef } from 'react';

import type { SceneGraphManager } from '@motionlab/viewport';

interface WorldSpaceOverlayProps {
  /** 3D world position to project to screen. */
  worldPosition: { x: number; y: number; z: number };
  /** SceneGraphManager instance for camera/scene access. */
  sceneGraph: SceneGraphManager;
  /** Pixel offset from projected position. */
  offset?: { x: number; y: number };
  /** Allow pointer interaction within the overlay. */
  interactive?: boolean;
  children: React.ReactNode;
}

/**
 * Positions children at screen coordinates projected from a 3D world position.
 *
 * Used during joint creation to show floating labels anchored to datum positions
 * in the 3D viewport. Updates every frame via requestAnimationFrame using direct
 * DOM manipulation to avoid React re-renders on the hot path.
 */
export function WorldSpaceOverlay({
  worldPosition,
  sceneGraph,
  offset,
  interactive = false,
  children,
}: WorldSpaceOverlayProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const el = divRef.current;
    if (!el) return;

    const tick = () => {
      const projected = sceneGraph.projectToScreen(worldPosition);

      // Hide when behind camera (z > 1)
      const inBounds = projected.z <= 1 && projected.x >= 0 && projected.y >= 0;

      if (inBounds) {
        const ox = offset?.x ?? 0;
        const oy = offset?.y ?? 0;
        el.style.left = `${projected.x + ox}px`;
        el.style.top = `${projected.y + oy}px`;
        el.style.display = '';
      } else {
        el.style.display = 'none';
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [sceneGraph, worldPosition.x, worldPosition.y, worldPosition.z, offset?.x, offset?.y]);

  return (
    <div
      ref={divRef}
      className={`${interactive ? 'pointer-events-auto' : 'pointer-events-none'} absolute z-10`}
      style={{
        display: 'none',
        transform: 'translate(-50%, -100%)',
      }}
    >
      {children}
    </div>
  );
}
