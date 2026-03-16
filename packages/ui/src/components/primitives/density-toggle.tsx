import { Maximize2, Minimize2 } from 'lucide-react';

import { ToolbarButton } from '@/components/primitives/toolbar-button';

interface DensityToggleProps {
  density: 'comfortable' | 'compact';
  onToggle: () => void;
}

function DensityToggle({ density, onToggle }: DensityToggleProps) {
  return (
    <ToolbarButton
      tooltip={density === 'comfortable' ? 'Compact mode' : 'Comfortable mode'}
      onClick={onToggle}
    >
      {density === 'comfortable' ? <Minimize2 /> : <Maximize2 />}
    </ToolbarButton>
  );
}

export { DensityToggle };
export type { DensityToggleProps };
