import { useEffect, useRef, useState } from 'react';

import type { SceneGraphManager } from '@motionlab/viewport';

interface WorldSpaceOverlayProps {
  /** 3D world position to project to screen. */
  worldPosition: { x: number; y: number; z: number };
  /** SceneGraphManager instance for camera/scene access. */
  sceneGraph: SceneGraphManager;
  /** Pixel offset from projected position. */
  offset?: { x: number; y: number };
  children: React.ReactNode;
}

/**
 * Positions children at screen coordinates projected from a 3D world position.
 *
 * Used during joint creation to show floating labels anchored to datum positions
 * in the 3D viewport. Updates every frame via requestAnimationFrame so the
 * overlay tracks camera movement smoothly.
 */
export function WorldSpaceOverlay({
  worldPosition,
  sceneGraph,
  offset,
  children,
}: WorldSpaceOverlayProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const [screenPos, setScreenPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [visible, setVisible] = useState(false);
  const rafRef = useRef(0);

  useEffect(() => {
    const tick = () => {
      const projected = sceneGraph.projectToScreen(worldPosition);

      // Hide when behind camera (z > 1)
      const inBounds = projected.z <= 1 && projected.x >= 0 && projected.y >= 0;

      setVisible(inBounds);
      if (inBounds) {
        const ox = offset?.x ?? 0;
        const oy = offset?.y ?? 0;
        setScreenPos({ x: projected.x + ox, y: projected.y + oy });
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [sceneGraph, worldPosition.x, worldPosition.y, worldPosition.z, offset?.x, offset?.y]);

  if (!visible) return null;

  return (
    <div
      ref={divRef}
      className="pointer-events-none absolute z-10"
      style={{
        left: screenPos.x,
        top: screenPos.y,
        transform: 'translate(-50%, -100%)',
      }}
    >
      {children}
    </div>
  );
}
