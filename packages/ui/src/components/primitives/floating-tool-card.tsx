import { X } from 'lucide-react';
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { cn } from '../../lib/utils';
import { Button } from '../ui/button';

interface FloatingToolCardProps {
  /** Tool icon (16px slot) */
  icon?: ReactNode;
  /** Tool name displayed in header */
  title: string;
  /** Called when close button clicked or Escape pressed */
  onClose?: () => void;
  /** Body content — typically PropertyRows */
  children?: ReactNode;
  /** Footer action buttons — rendered in a right-aligned row */
  footer?: ReactNode;
  /** Initial position offset from default top-left */
  defaultPosition?: { x: number; y: number };
  className?: string;
}

function FloatingToolCard({
  icon,
  title,
  onClose,
  children,
  footer,
  defaultPosition,
  className,
}: FloatingToolCardProps) {
  const [position, setPosition] = useState(defaultPosition ?? { x: 12, y: 12 });
  const [isDragging, setIsDragging] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(
    null,
  );
  const cardRef = useRef<HTMLDivElement>(null);

  // Panel-aware initial position: offset by --vp-inset-left on mount
  useLayoutEffect(() => {
    if (!cardRef.current) return;
    const el = cardRef.current.closest('[style*="--vp-inset-left"]') as HTMLElement | null;
    if (el) {
      const insetLeft = parseFloat(getComputedStyle(el).getPropertyValue('--vp-inset-left')) || 0;
      if (insetLeft > 0) {
        setPosition((prev) => ({ x: prev.x + insetLeft, y: prev.y }));
      }
    }
    setMounted(true);
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only left button
      if (e.button !== 0) return;
      e.preventDefault();
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: position.x,
        origY: position.y,
      };
      setIsDragging(true);
    },
    [position],
  );

  useEffect(() => {
    if (!isDragging) return;

    function handleMouseMove(e: MouseEvent) {
      if (!dragRef.current || !cardRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      let newX = dragRef.current.origX + dx;
      let newY = dragRef.current.origY + dy;

      // Clamp to offsetParent bounds
      const parent = cardRef.current.offsetParent as HTMLElement | null;
      if (parent) {
        const parentRect = parent.getBoundingClientRect();
        const cardRect = cardRef.current.getBoundingClientRect();
        const maxX = parentRect.width - cardRect.width;
        const maxY = parentRect.height - cardRect.height;
        newX = Math.max(0, Math.min(maxX, newX));
        newY = Math.max(0, Math.min(maxY, newY));
      }

      setPosition({ x: newX, y: newY });
    }

    function handleMouseUp() {
      dragRef.current = null;
      setIsDragging(false);
    }

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Escape to dismiss
  useEffect(() => {
    if (!onClose) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose?.();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      ref={cardRef}
      data-slot="floating-tool-card"
      className={cn(
        'absolute min-w-[240px] w-[260px] max-w-[300px]',
        'bg-[var(--layer-base-glass)] backdrop-blur-[var(--panel-blur)]',
        'border border-[var(--border-default)]',
        'rounded-[var(--panel-radius)] shadow-[var(--shadow-low)]',
        'z-[var(--z-floating)]',
        !mounted && 'animate-in fade-in-0 duration-[var(--duration-fast)]',
        className,
      )}
      style={{
        left: position.x,
        top: position.y,
        willChange: isDragging ? 'left, top' : undefined,
      }}
    >
      {/* Header */}
      <div
        data-slot="floating-tool-card-header"
        role="toolbar"
        className={cn(
          'flex h-7 items-center gap-1.5 ps-2 pe-1',
          'bg-foreground/5 border-b border-[var(--border-subtle)]',
          isDragging ? 'cursor-grabbing' : 'cursor-grab',
        )}
        onMouseDown={handleMouseDown}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose?.();
        }}
      >
        {icon && (
          <span
            data-slot="floating-tool-card-icon"
            className="flex size-4 shrink-0 items-center justify-center"
          >
            {icon}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-[length:var(--text-sm)] font-semibold text-[var(--text-primary)]">
          {title}
        </span>
        {onClose && (
          <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        )}
      </div>

      {/* Body */}
      {children && (
        <div
          data-slot="floating-tool-card-body"
          className="py-1"
          style={{ '--inspector-label-w': '70px' } as CSSProperties}
        >
          {children}
        </div>
      )}

      {/* Footer */}
      {footer && (
        <div
          data-slot="floating-tool-card-footer"
          className="flex items-center justify-end gap-1.5 ps-2 pe-1.5 py-1 border-t border-[var(--border-subtle)]"
        >
          {footer}
        </div>
      )}
    </div>
  );
}

export { FloatingToolCard };
export type { FloatingToolCardProps };
