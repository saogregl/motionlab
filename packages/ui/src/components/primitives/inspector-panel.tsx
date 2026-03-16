import { MousePointerClick } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

/* ── Types ── */

interface InspectorPanelProps {
  /** Entity name — when falsy, shows empty state */
  entityName?: string;
  /** Entity type label (e.g. "Body", "Joint") */
  entityType?: string;
  /** Entity icon (20px) */
  entityIcon?: ReactNode;
  /** Status line below the name */
  statusLine?: string;
  /** Quick actions button content */
  quickActions?: ReactNode;
  /** InspectorSection children */
  children?: ReactNode;
  className?: string;
}

/* ── InspectorPanel ── */

function InspectorPanel({
  entityName,
  entityType,
  entityIcon,
  statusLine,
  quickActions,
  children,
  className,
}: InspectorPanelProps) {
  if (!entityName) {
    return (
      <div
        data-slot="inspector-panel"
        className={cn(
          'flex h-full flex-col items-center justify-center gap-2 text-[var(--text-tertiary)]',
          className,
        )}
      >
        <MousePointerClick className="size-12 opacity-40" />
        <span className="text-[length:var(--text-sm)]">Select an object to inspect</span>
      </div>
    );
  }

  return (
    <div data-slot="inspector-panel" className={cn('flex h-full flex-col', className)}>
      {/* Header */}
      <div
        data-slot="inspector-panel-header"
        className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] px-3"
      >
        {entityIcon && (
          <span className="flex size-5 shrink-0 items-center justify-center text-[var(--text-secondary)]">
            {entityIcon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          {entityType && (
            <div className="text-[length:var(--text-xs)] uppercase text-[var(--text-tertiary)]">
              {entityType}
            </div>
          )}
          <div className="truncate text-[length:var(--text-base)] font-semibold text-[var(--text-primary)]">
            {entityName}
          </div>
          {statusLine && (
            <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
              {statusLine}
            </div>
          )}
        </div>
        {quickActions && (
          <div className="flex size-6 shrink-0 items-center justify-center">{quickActions}</div>
        )}
      </div>

      {/* Body */}
      <ScrollArea className="flex-1">
        <div data-slot="inspector-panel-body">{children}</div>
      </ScrollArea>
    </div>
  );
}

export { InspectorPanel };
export type { InspectorPanelProps };
