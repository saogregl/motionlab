import type { ReactNode } from 'react';

import { cn } from '../../lib/utils';

interface ViewportHUDProps {
  /** Top-left slot — typically FloatingToolCard */
  topLeft?: ReactNode;
  /** Top-right slot — typically ViewCube + shading controls */
  topRight?: ReactNode;
  /** Bottom-left slot — typically AxisIndicator */
  bottomLeft?: ReactNode;
  /** Bottom-center slot — typically SelectionChip */
  bottomCenter?: ReactNode;
  /** Bottom-right slot — typically ResultLegend */
  bottomRight?: ReactNode;
  className?: string;
}

function ViewportHUD({
  topLeft,
  topRight,
  bottomLeft,
  bottomCenter,
  bottomRight,
  className,
}: ViewportHUDProps) {
  return (
    <div data-slot="viewport-hud" className={cn('absolute inset-0 pointer-events-none', className)}>
      {/* Top-left: FloatingToolCard */}
      {topLeft && (
        <div
          data-slot="viewport-hud-top-left"
          className="absolute top-3 left-3 pointer-events-auto"
        >
          {topLeft}
        </div>
      )}

      {/* Top-right: ViewCube + shading controls */}
      {topRight && (
        <div
          data-slot="viewport-hud-top-right"
          className="absolute top-3 right-3 flex flex-col items-end gap-2 pointer-events-auto"
        >
          {topRight}
        </div>
      )}

      {/* Bottom-left: AxisIndicator */}
      {bottomLeft && (
        <div
          data-slot="viewport-hud-bottom-left"
          className="absolute bottom-3 left-3 pointer-events-auto"
        >
          {bottomLeft}
        </div>
      )}

      {/* Bottom-center: SelectionChip */}
      {bottomCenter && (
        <div
          data-slot="viewport-hud-bottom-center"
          className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-auto"
        >
          {bottomCenter}
        </div>
      )}

      {/* Bottom-right: ResultLegend */}
      {bottomRight && (
        <div
          data-slot="viewport-hud-bottom-right"
          className="absolute bottom-3 right-3 pointer-events-auto"
        >
          {bottomRight}
        </div>
      )}
    </div>
  );
}

export { ViewportHUD };
export type { ViewportHUDProps };
