import { Home, Maximize2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { ToolbarButton } from '@/components/primitives/toolbar-button';

interface ViewCubeProps {
  onHome?: () => void;
  onZoomFit?: () => void;
  className?: string;
}

const FACE_LABELS = ['Front', 'Back', 'Right', 'Left', 'Top', 'Bottom'] as const;

function ViewCube({ onHome, onZoomFit, className }: ViewCubeProps) {
  return (
    <div className={cn('flex flex-col items-center gap-1', className)}>
      {/* 3D Cube */}
      <div
        data-slot="view-cube"
        className="size-16 shadow-[var(--shadow-low)] rounded-[var(--radius-sm)]"
        style={{ perspective: '200px' }}
      >
        <div
          className="relative size-full"
          style={{
            transformStyle: 'preserve-3d',
            transform: 'rotateX(-20deg) rotateY(-30deg)',
          }}
        >
          {FACE_LABELS.map((label, i) => (
            <div
              key={label}
              className="absolute inset-0 flex items-center justify-center bg-[var(--layer-base)] text-[8px] font-medium uppercase tracking-wider text-[var(--text-tertiary)] backface-hidden"
              style={getFaceTransform(i)}
            >
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-0.5">
        <ToolbarButton tooltip="Home view" onClick={onHome}>
          <Home />
        </ToolbarButton>
        <ToolbarButton tooltip="Zoom to fit" onClick={onZoomFit}>
          <Maximize2 />
        </ToolbarButton>
      </div>
    </div>
  );
}

function getFaceTransform(index: number): React.CSSProperties {
  const half = 32; // 64px / 2
  switch (index) {
    case 0: // Front
      return { transform: `translateZ(${half}px)` };
    case 1: // Back
      return { transform: `rotateY(180deg) translateZ(${half}px)` };
    case 2: // Right
      return { transform: `rotateY(90deg) translateZ(${half}px)` };
    case 3: // Left
      return { transform: `rotateY(-90deg) translateZ(${half}px)` };
    case 4: // Top
      return { transform: `rotateX(90deg) translateZ(${half}px)` };
    case 5: // Bottom
      return { transform: `rotateX(-90deg) translateZ(${half}px)` };
    default:
      return {};
  }
}

export { ViewCube };
export type { ViewCubeProps };
