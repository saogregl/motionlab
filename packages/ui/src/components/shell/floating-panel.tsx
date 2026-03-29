import type { ReactNode } from 'react';
import { useCallback, useRef, useState } from 'react';

import { useLayoutManager } from '../../layout';
import { useLayoutSlot } from '../../layout';
import { cn } from '../../lib/utils';

interface FloatingPanelProps {
  side: 'left' | 'right';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  onWidthChange?: (width: number) => void;
  className?: string;
  children: ReactNode;
}

function FloatingPanel({
  side,
  open = true,
  width,
  minWidth = 240,
  maxWidth = 420,
  onWidthChange,
  className,
  children,
}: FloatingPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const manager = useLayoutManager();

  useLayoutSlot(`panel-${side}`, side, width ?? 288, open, isDragging);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const currentWidth = panelRef.current?.offsetWidth ?? width ?? 288;
      dragStartRef.current = { startX: e.clientX, startWidth: currentWidth };
      setIsDragging(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [width],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragStartRef.current) return;
      const { startX, startWidth } = dragStartRef.current;
      const delta = side === 'left' ? e.clientX - startX : startX - e.clientX;
      const newWidth = Math.round(Math.min(maxWidth, Math.max(minWidth, startWidth + delta)));
      // Direct DOM mutation — no React re-render during drag
      const panel = panelRef.current;
      if (panel) panel.style.width = `${newWidth}px`;
      // Update layout engine imperatively so side-panel offsets stay in sync
      manager.updateSlot({ id: `panel-${side}`, side, size: newWidth, open: true, instant: true });
    },
    [side, minWidth, maxWidth, manager],
  );

  const handlePointerUp = useCallback(() => {
    if (!dragStartRef.current) return;
    // Commit final width to React state (single re-render)
    const panel = panelRef.current;
    if (panel) {
      const finalWidth = panel.offsetWidth;
      onWidthChange?.(finalWidth);
    }
    dragStartRef.current = null;
    setIsDragging(false);
  }, [onWidthChange]);

  const isLeft = side === 'left';

  return (
    <div
      ref={panelRef}
      data-slot="floating-panel"
      data-side={side}
      data-open={open || undefined}
      className={cn(
        'absolute top-[var(--panel-float-inset)] bottom-[var(--side-panel-bottom,var(--panel-float-inset))] z-[var(--z-panel)]',
        'flex flex-col overflow-hidden',
        'rounded-[var(--panel-radius)] border border-[var(--border-default)] bg-[var(--layer-base-glass)] backdrop-blur-[var(--panel-blur)] shadow-[var(--shadow-low)]',
        'transition-[transform,opacity] duration-[var(--duration-normal)] ease-[var(--easing-default)]',
        isLeft ? 'left-[var(--panel-float-inset)]' : 'right-[var(--panel-float-inset)]',
        open
          ? 'translate-x-0 opacity-100'
          : isLeft
            ? '-translate-x-[calc(100%+var(--panel-float-inset))] opacity-0 pointer-events-none'
            : 'translate-x-[calc(100%+var(--panel-float-inset))] opacity-0 pointer-events-none',
        className,
      )}
      style={{ width: width ?? undefined }}
    >
      {children}

      {/* Resize handle on inner edge */}
      <div
        data-slot="panel-resize-handle"
        className={cn(
          'absolute top-0 bottom-0 z-10 w-2 cursor-col-resize',
          isLeft ? 'right-0 translate-x-1/2' : 'left-0 -translate-x-1/2',
          isDragging ? 'bg-accent-primary/20' : 'bg-transparent hover:bg-accent-primary/10',
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    </div>
  );
}

interface FloatingPanelHeaderProps {
  children: ReactNode;
  className?: string;
}

function FloatingPanelHeader({ children, className }: FloatingPanelHeaderProps) {
  return (
    <div
      data-slot="floating-panel-header"
      className={cn(
        'flex h-11 shrink-0 items-center justify-between border-b border-[var(--border-default)] ps-4 pe-4',
        className,
      )}
    >
      {children}
    </div>
  );
}

export { FloatingPanel, FloatingPanelHeader };
export type { FloatingPanelProps, FloatingPanelHeaderProps };
