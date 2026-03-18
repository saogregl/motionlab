import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

interface InlineEditableNameProps {
  /** Current name value */
  value: string;
  /** Whether inline editing is active */
  isEditing: boolean;
  /** Called when the user wants to start editing (e.g. double-click) */
  onStartEdit: () => void;
  /** Called when the user commits a new name */
  onCommit: (newName: string) => void;
  /** Called when the user cancels editing */
  onCancel: () => void;
  className?: string;
}

function InlineEditableName({
  value,
  isEditing,
  onStartEdit,
  onCommit,
  onCancel,
  className,
}: InlineEditableNameProps) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      setDraft(value);
      // Defer focus + select so the input is mounted
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [isEditing, value]);

  const commitOrCancel = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      onCommit(trimmed);
    } else {
      onCancel();
    }
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitOrCancel();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
          // Prevent tree keyboard navigation while editing
          e.stopPropagation();
        }}
        onBlur={commitOrCancel}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'h-[var(--tree-row-h)] w-full min-w-0 rounded-[var(--radius-sm)] border border-[var(--accent-primary)] bg-[var(--layer-base)] px-1 text-[length:var(--text-xs)] text-[var(--text-primary)] outline-none',
          className,
        )}
      />
    );
  }

  return (
    <span
      className={cn(
        'min-w-0 flex-1 truncate text-[length:var(--text-xs)] text-[var(--text-primary)]',
        className,
      )}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onStartEdit();
      }}
    >
      {value}
    </span>
  );
}

export { InlineEditableName };
export type { InlineEditableNameProps };
