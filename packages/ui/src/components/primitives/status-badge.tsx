import { cn } from '../../lib/utils';

type StatusType = 'compiled' | 'stale' | 'running' | 'failed' | 'warning';

interface StatusBadgeProps {
  status: StatusType;
  /** Override display label (defaults to capitalized status name) */
  label?: string;
  className?: string;
}

const STATUS_DOT_COLOR: Record<StatusType, string> = {
  compiled: 'bg-[var(--status-compiled)]',
  stale: 'bg-[var(--status-stale)]',
  running: 'bg-[var(--status-running)]',
  failed: 'bg-[var(--status-failed)]',
  warning: 'bg-[var(--status-warning)]',
};

const STATUS_LABELS: Record<StatusType, string> = {
  compiled: 'Compiled',
  stale: 'Stale',
  running: 'Running',
  failed: 'Failed',
  warning: 'Warning',
};

function StatusBadge({ status, label, className }: StatusBadgeProps) {
  return (
    <span
      data-slot="status-badge"
      data-status={status}
      className={cn(
        'inline-flex h-5 items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--bg-muted)] px-2 text-[length:var(--text-2xs)] font-medium text-[var(--text-secondary)]',
        className,
      )}
    >
      <span
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          STATUS_DOT_COLOR[status],
          status === 'running' && 'animate-pulse',
        )}
      />
      {label ?? STATUS_LABELS[status]}
    </span>
  );
}

export { StatusBadge };
export type { StatusBadgeProps, StatusType };
