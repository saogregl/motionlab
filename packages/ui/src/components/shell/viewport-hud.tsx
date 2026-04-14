import type { ReactNode } from 'react';

import { cn } from '../../lib/utils';

interface ViewportHUDProps {
  /** Top-left slot — typically FloatingToolCard */
  topLeft?: ReactNode;
  /** Top-center slot — typically ConnectionBanner */
  topCenter?: ReactNode;
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

/**
 * Viewport HUD positions elements in 6 slots around the viewport.
 *
 * Panel-aware: reads --vp-inset-left / --vp-inset-right CSS custom properties
 * (set by AppShell on the main-area div) to offset corners away from floating panels.
 */
function ViewportHUD({
  topLeft,
  topCenter,
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
          className="absolute top-3 pointer-events-auto"
          style={{ left: 'calc(var(--vp-inset-left, 0px) + 12px)' }}
        >
          {topLeft}
        </div>
      )}

      {/* Top-center: ConnectionBanner */}
      {topCenter && (
        <div
          data-slot="viewport-hud-top-center"
          className="absolute top-3 -translate-x-1/2 pointer-events-auto"
          style={{
            left: 'calc(var(--vp-inset-left, 0px) + (100% - var(--vp-inset-left, 0px) - var(--vp-inset-right, 0px)) / 2)',
          }}
        >
          {topCenter}
        </div>
      )}

      {/* Top-right: ViewCube + shading controls */}
      {topRight && (
        <div
          data-slot="viewport-hud-top-right"
          className="absolute top-3 flex flex-col items-end gap-2 pointer-events-auto"
          style={{ right: 'calc(var(--vp-inset-right, 0px) + 12px)' }}
        >
          {topRight}
        </div>
      )}

      {/* Bottom-left: AxisIndicator */}
      {bottomLeft && (
        <div
          data-slot="viewport-hud-bottom-left"
          className="absolute pointer-events-auto"
          style={{
            left: 'calc(var(--vp-inset-left, 0px) + 12px)',
            bottom: 'calc(var(--vp-inset-bottom, 0px) + 12px)',
          }}
        >
          {bottomLeft}
        </div>
      )}

      {/* Bottom-center: SelectionChip */}
      {bottomCenter && (
        <div
          data-slot="viewport-hud-bottom-center"
          className="absolute -translate-x-1/2 pointer-events-auto"
          style={{
            left: 'calc(var(--vp-inset-left, 0px) + (100% - var(--vp-inset-left, 0px) - var(--vp-inset-right, 0px)) / 2)',
            bottom: 'calc(var(--vp-inset-bottom, 0px) + 12px)',
          }}
        >
          {bottomCenter}
        </div>
      )}

      {/* Bottom-right: ResultLegend */}
      {bottomRight && (
        <div
          data-slot="viewport-hud-bottom-right"
          className="absolute pointer-events-auto"
          style={{
            right: 'calc(var(--vp-inset-right, 0px) + 12px)',
            bottom: 'calc(var(--vp-inset-bottom, 0px) + 12px)',
          }}
        >
          {bottomRight}
        </div>
      )}
    </div>
  );
}

export { ViewportHUD };
export type { ViewportHUDProps };
