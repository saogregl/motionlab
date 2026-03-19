import { ChevronRight, Eye, EyeOff, MoreHorizontal } from 'lucide-react';
import type React from 'react';
import type { ReactNode } from 'react';

import { cn } from '../../lib/utils';

/* ── TreeRow ── */

interface TreeRowProps {
  /** Nesting depth (0 = root) */
  level: number;
  /** Display name */
  name: string;
  /** Type icon slot (16px) */
  icon?: ReactNode;
  /** Secondary text (right of name) */
  secondary?: string;
  /** Has children → show disclosure chevron */
  hasChildren?: boolean;
  /** Expanded state (only meaningful when hasChildren) */
  expanded?: boolean;
  /** Callbacks */
  onToggleExpand?: () => void;
  onSelect?: (event?: React.MouseEvent) => void;
  onToggleVisibility?: () => void;
  onContextMenu?: () => void;
  /** State flags — applied as data attributes */
  selected?: boolean;
  focused?: boolean;
  disabled?: boolean;
  dragTarget?: boolean;
  /** Hidden (visibility off) */
  hidden?: boolean;
  /** Status dot color */
  status?: 'warning' | 'danger';
  /** ARIA */
  role?: string;
  'aria-level'?: number;
  'aria-setsize'?: number;
  'aria-posinset'?: number;
  className?: string;
}

function TreeRow({
  level,
  name,
  icon,
  secondary,
  hasChildren,
  expanded,
  onToggleExpand,
  onSelect,
  onToggleVisibility,
  onContextMenu,
  selected,
  focused,
  disabled,
  dragTarget,
  hidden: isHidden,
  status,
  className,
  ...ariaProps
}: TreeRowProps) {
  return (
    <div
      data-slot="tree-row"
      role="treeitem"
      tabIndex={-1}
      data-selected={selected || undefined}
      data-focused={focused || undefined}
      data-disabled={disabled || undefined}
      data-drag-target={dragTarget || undefined}
      className={cn(
        'group/tree-row h-[var(--tree-row-h)]',
        'hover:bg-[var(--hover-overlay)]',
        'data-[selected]:bg-[var(--selection-row)]',
        'data-[selected]:data-[focused]:shadow-[inset_1.5px_0_0_var(--accent-primary)]',
        'data-[selected]:not([data-focused]):bg-[var(--selection-row-inactive)]',
        'data-[disabled]:opacity-50 data-[disabled]:text-[var(--text-disabled)]',
        'data-[drag-target]:bg-[var(--selection-drag-bg)] data-[drag-target]:border-y-2 data-[drag-target]:border-y-[var(--selection-drag-border)]',
        className,
      )}
      onClick={(e) => onSelect?.(e)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect?.();
        }
      }}
      {...ariaProps}
    >
      <div
        className="relative flex h-full items-center pr-2"
        style={{ paddingLeft: `calc(var(--space-1) + ${level} * var(--tree-indent))` }}
      >
        {/* Guide lines */}
        {level > 0 &&
          Array.from({ length: level }, (_, idx) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: static decorative guide lines keyed by fixed depth level
              key={`guide-${level}-${idx}`}
              aria-hidden
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-tree-guide"
              style={{
                left: `calc(var(--space-1) + ${idx} * var(--tree-indent) + var(--tree-indent) / 2)`,
              }}
            />
          ))}

        {/* Disclosure chevron */}
        {hasChildren ? (
          <button
            data-slot="tree-row-chevron"
            type="button"
            className="flex size-4 shrink-0 items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand?.();
            }}
            tabIndex={-1}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <ChevronRight
              className={cn(
                'size-2.5 transition-transform duration-[var(--duration-fast)]',
                expanded && 'rotate-90',
              )}
            />
          </button>
        ) : (
          <span className="size-4 shrink-0" />
        )}

        {/* Type icon */}
        {icon && (
          <span
            data-slot="tree-row-icon"
            className="mr-1.5 flex size-3.5 shrink-0 items-center justify-center"
          >
            {icon}
          </span>
        )}

        {/* Name */}
        <span
          data-slot="tree-row-name"
          className="min-w-0 flex-1 truncate font-normal text-[length:var(--text-xs)] text-[var(--text-primary)]"
        >
          {name}
        </span>

        {/* Secondary text */}
        {secondary && (
          <span
            data-slot="tree-row-secondary"
            className="ml-1.5 max-w-[60px] shrink-0 truncate text-[length:var(--text-2xs)] text-[var(--text-disabled)]"
          >
            {secondary}
          </span>
        )}

        {/* Status dot */}
        {status && (
          <span
            data-slot="tree-row-status"
            className={cn(
              'ml-1 size-2 shrink-0 rounded-full',
              status === 'warning' && 'bg-[var(--warning)]',
              status === 'danger' && 'bg-[var(--danger)]',
            )}
          />
        )}

        {/* Visibility toggle */}
        {onToggleVisibility && (
          <button
            data-slot="tree-row-visibility"
            type="button"
            className={cn(
              'ml-0.5 flex size-3.5 shrink-0 items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)]',
              !isHidden && 'opacity-0 group-hover/tree-row:opacity-100',
            )}
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisibility();
            }}
            tabIndex={-1}
            aria-label={isHidden ? 'Show' : 'Hide'}
          >
            {isHidden ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
          </button>
        )}

        {/* Context menu trigger */}
        {onContextMenu && (
          <button
            data-slot="tree-row-context"
            type="button"
            className="ml-0.5 flex size-3.5 shrink-0 items-center justify-center text-[var(--text-tertiary)] opacity-0 hover:text-[var(--text-primary)] group-hover/tree-row:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onContextMenu();
            }}
            tabIndex={-1}
            aria-label="More actions"
          >
            <MoreHorizontal className="size-3" />
          </button>
        )}
      </div>
    </div>
  );
}

/* ── GroupHeaderRow ── */

interface GroupHeaderRowProps {
  /** Group label */
  label: string;
  /** Child count */
  count?: number;
  /** Nesting depth */
  level?: number;
  /** Expanded state */
  expanded?: boolean;
  onToggleExpand?: () => void;
  className?: string;
}

function GroupHeaderRow({
  label,
  count,
  level = 0,
  expanded,
  onToggleExpand,
  className,
}: GroupHeaderRowProps) {
  return (
    <div
      data-slot="group-header-row"
      className={cn(
        'flex h-[var(--tree-row-h)] items-center pr-2',
        'hover:bg-[var(--hover-overlay)]',
        className,
      )}
      style={{ paddingLeft: `calc(var(--space-1) + ${level} * var(--tree-indent))` }}
      onClick={onToggleExpand}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggleExpand?.();
        }
      }}
      role="treeitem"
      tabIndex={-1}
    >
      {/* Disclosure chevron */}
      <span className="flex size-4 shrink-0 items-center justify-center text-[var(--text-tertiary)]">
        <ChevronRight
          className={cn(
            'size-2.5 transition-transform duration-[var(--duration-fast)]',
            expanded && 'rotate-90',
          )}
        />
      </span>

      {/* Label */}
      <span
        data-slot="group-header-label"
        className="min-w-0 flex-1 truncate text-[length:var(--text-xs)] font-medium text-[var(--text-tertiary)]"
      >
        {label}
        {count != null && (
          <span className="ml-1 font-normal text-[var(--text-disabled)]">({count})</span>
        )}
      </span>
    </div>
  );
}

export { TreeRow, GroupHeaderRow };
export type { TreeRowProps, GroupHeaderRowProps };
