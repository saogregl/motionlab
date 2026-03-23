import { useEffect, useRef, useState } from 'react';

import type { DatumPreviewType } from '@motionlab/viewport';

interface FaceTooltipProps {
  /** The viewport container to track pointer position within. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Current hovered face info from the picking system. */
  hoveredFace: { bodyId: string; faceIndex: number; previewType?: DatumPreviewType } | null;
}

const PREVIEW_TYPE_LABELS: Record<DatumPreviewType, string> = {
  plane: 'Plane',
  axis: 'Axis',
  point: 'Point',
};

/**
 * Floating tooltip that follows the cursor and shows the hovered face index
 * and estimated surface type during create-datum mode.
 */
export function FaceTooltip({ containerRef, hoveredFace }: FaceTooltipProps) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const rafRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMove = (e: PointerEvent) => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const rect = container.getBoundingClientRect();
        setPos({ x: e.clientX - rect.left + 16, y: e.clientY - rect.top - 8 });
      });
    };

    container.addEventListener('pointermove', handleMove);
    return () => {
      container.removeEventListener('pointermove', handleMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, [containerRef]);

  if (!hoveredFace) return null;

  const label = hoveredFace.previewType
    ? `${PREVIEW_TYPE_LABELS[hoveredFace.previewType]} (Face ${hoveredFace.faceIndex})`
    : `Face ${hoveredFace.faceIndex}`;

  return (
    <div
      className="pointer-events-none absolute z-50 rounded bg-background/90 px-2 py-1 text-xs text-foreground shadow-sm backdrop-blur-sm"
      style={{ left: pos.x, top: pos.y }}
    >
      {label}
    </div>
  );
}
