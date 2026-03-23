import { Crosshair, Link2, MousePointer2, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { ToolMode } from '../stores/tool-mode.js';
import { useToolModeStore } from '../stores/tool-mode.js';

const MODE_CONFIG: Record<ToolMode, { label: string; Icon: typeof MousePointer2 }> = {
  select: { label: 'Select Mode', Icon: MousePointer2 },
  'create-datum': { label: 'Create Datum', Icon: Crosshair },
  'create-joint': { label: 'Create Joint', Icon: Link2 },
  'create-load': { label: 'Create Load', Icon: Zap },
};

const DISMISS_MS = 1500;

/**
 * Brief viewport-local indicator shown when the tool mode changes.
 * Fades in at the top-center of the viewport and auto-dismisses.
 */
export function ModeIndicator() {
  const activeMode = useToolModeStore((s) => s.activeMode);
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);
  const prevModeRef = useRef(activeMode);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (activeMode === prevModeRef.current) return;
    prevModeRef.current = activeMode;

    // Show indicator
    setVisible(true);
    setFading(false);

    // Clear any pending dismiss
    if (timerRef.current) clearTimeout(timerRef.current);

    // Start fade-out shortly before dismissing
    timerRef.current = setTimeout(() => {
      setFading(true);
      timerRef.current = setTimeout(() => {
        setVisible(false);
        setFading(false);
      }, 200);
    }, DISMISS_MS - 200);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activeMode]);

  if (!visible) return null;

  const { label, Icon } = MODE_CONFIG[activeMode];

  return (
    <div
      className={`
        pointer-events-none absolute left-1/2 top-4 z-40 -translate-x-1/2
        flex items-center gap-1.5
        rounded-[var(--radius-md)] bg-[var(--layer-elevated)]/90 px-3 py-1.5
        text-[length:var(--text-xs)] font-medium text-text-primary
        backdrop-blur-sm
        transition-all duration-200 ease-out
        ${fading ? 'translate-y-[-4px] opacity-0' : 'translate-y-0 opacity-100'}
      `}
    >
      <Icon className="size-3.5" />
      {label}
    </div>
  );
}
