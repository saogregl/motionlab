import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

/* ── Types ── */

export interface TreeNode {
  id: string;
  parentId: string | null;
  level: number;
  name: string;
  hasChildren: boolean;
  /** Any additional data the consumer attaches */
  [key: string]: unknown;
}

interface TreeViewProps {
  /** Pre-ordered depth-first flat list of all nodes */
  nodes: TreeNode[];
  /** Selected node ids (controlled) */
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  /** Expanded node ids — controlled mode */
  expandedIds?: Set<string>;
  onExpandedChange?: (ids: Set<string>) => void;
  /** Default expanded ids — uncontrolled mode */
  defaultExpandedIds?: Set<string>;
  /** Render function for each row */
  renderRow: (node: TreeNode, props: TreeRowRenderProps) => React.ReactNode;
  /** Estimated row height (default 28px from --tree-row-h) */
  estimateSize?: number;
  /** Overscan count (default 5) */
  overscan?: number;
  className?: string;
}

export interface TreeRowRenderProps {
  selected: boolean;
  focused: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onSelect: () => void;
}

/* ── TreeView ── */

function TreeView({
  nodes,
  selectedIds,
  onSelectionChange,
  expandedIds: controlledExpanded,
  onExpandedChange,
  defaultExpandedIds,
  renderRow,
  estimateSize = 28,
  overscan = 5,
  className,
}: TreeViewProps) {
  // Expand/collapse state (supports controlled + uncontrolled)
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState<Set<string>>(
    () => defaultExpandedIds ?? new Set(),
  );
  const expandedIds = controlledExpanded ?? uncontrolledExpanded;
  const setExpandedIds = onExpandedChange ?? setUncontrolledExpanded;

  // Focus tracking
  const [focusedIndex, setFocusedIndex] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Compute visible nodes: filter out children of collapsed parents
  const visibleNodes = useMemo(() => {
    const result: TreeNode[] = [];
    const collapsedAncestorLevel: number[] = [];

    for (const node of nodes) {
      // Check if any ancestor is collapsed
      while (
        collapsedAncestorLevel.length > 0 &&
        node.level <= collapsedAncestorLevel[collapsedAncestorLevel.length - 1]
      ) {
        collapsedAncestorLevel.pop();
      }

      if (collapsedAncestorLevel.length > 0) continue;

      result.push(node);

      if (node.hasChildren && !expandedIds.has(node.id)) {
        collapsedAncestorLevel.push(node.level);
      }
    }

    return result;
  }, [nodes, expandedIds]);

  const virtualizer = useVirtualizer({
    count: visibleNodes.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  const toggleExpand = useCallback(
    (id: string) => {
      const next = new Set(expandedIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      setExpandedIds(next);
    },
    [expandedIds, setExpandedIds],
  );

  const handleSelect = useCallback(
    (id: string, index: number) => {
      onSelectionChange(new Set([id]));
      setFocusedIndex(index);
    },
    [onSelectionChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const node = visibleNodes[focusedIndex];
      if (!node) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (focusedIndex < visibleNodes.length - 1) {
            const nextIndex = focusedIndex + 1;
            setFocusedIndex(nextIndex);
            virtualizer.scrollToIndex(nextIndex);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (focusedIndex > 0) {
            const prevIndex = focusedIndex - 1;
            setFocusedIndex(prevIndex);
            virtualizer.scrollToIndex(prevIndex);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (node.hasChildren && !expandedIds.has(node.id)) {
            toggleExpand(node.id);
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (node.hasChildren && expandedIds.has(node.id)) {
            toggleExpand(node.id);
          }
          break;
        case 'Enter':
          e.preventDefault();
          onSelectionChange(new Set([node.id]));
          break;
      }
    },
    [focusedIndex, visibleNodes, expandedIds, toggleExpand, onSelectionChange, virtualizer],
  );

  return (
    <ScrollArea className={cn('h-full', className)}>
      <div
        ref={scrollContainerRef}
        data-slot="tree-view"
        role="tree"
        tabIndex={0}
        className="h-full overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/50"
        onKeyDown={handleKeyDown}
      >
        <div
          className="relative w-full"
          style={{ height: `${virtualizer.getTotalSize()}px` }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const node = visibleNodes[virtualRow.index];
            const isSelected = selectedIds.has(node.id);
            const isFocused = focusedIndex === virtualRow.index;
            const isExpanded = expandedIds.has(node.id);

            return (
              <div
                key={node.id}
                role="treeitem"
                aria-level={node.level + 1}
                aria-selected={isSelected}
                aria-expanded={node.hasChildren ? isExpanded : undefined}
                className="absolute left-0 top-0 w-full"
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {renderRow(node, {
                  selected: isSelected,
                  focused: isFocused,
                  expanded: isExpanded,
                  onToggleExpand: () => toggleExpand(node.id),
                  onSelect: () => handleSelect(node.id, virtualRow.index),
                })}
              </div>
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
}

export { TreeView };
