import { AlertTriangle, X } from 'lucide-react';

import { cn } from '../../lib/utils';

type BannerStatus = 'connecting' | 'disconnected' | 'error';

interface ConnectionBannerProps {
  /** Connection status triggering the banner */
  status: BannerStatus;
  /** Current reconnect attempt number */
  reconnectAttempt?: number;
  /** Error message to display */
  errorMessage?: string;
  /** Dismiss callback */
  onDismiss?: () => void;
  className?: string;
}

const STATUS_BG: Record<BannerStatus, string> = {
  connecting: 'bg-[var(--warning-soft)]',
  disconnected: 'bg-[var(--danger-soft)]',
  error: 'bg-[var(--danger-soft)]',
};

function getMessage(
  status: BannerStatus,
  reconnectAttempt?: number,
  errorMessage?: string,
): string {
  if (status === 'error' && errorMessage) {
    return `Engine error: ${errorMessage}`;
  }
  if (status === 'connecting') {
    const attempt = reconnectAttempt != null ? ` (attempt ${reconnectAttempt})` : '';
    return `Engine connecting${attempt}…`;
  }
  return 'Engine disconnected. Reconnecting…';
}

function ConnectionBanner({
  status,
  reconnectAttempt,
  errorMessage,
  onDismiss,
  className,
}: ConnectionBannerProps) {
  return (
    <div
      data-slot="connection-banner"
      className={cn(
        'flex items-center gap-2 rounded-[var(--radius-md)] ps-3 pe-1.5 py-1.5',
        'animate-in slide-in-from-top-1 duration-[var(--duration-normal)]',
        'shadow-[var(--shadow-medium)]',
        STATUS_BG[status],
        className,
      )}
    >
      <AlertTriangle className="size-3.5 shrink-0 text-[var(--text-primary)]" />
      <span className="flex-1 text-[length:var(--text-xs)] text-[var(--text-primary)]">
        {getMessage(status, reconnectAttempt, errorMessage)}
      </span>
      {onDismiss && (
        <button
          type="button"
          className="flex size-5 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover:bg-[var(--hover-overlay)] hover:text-[var(--text-primary)]"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

export { ConnectionBanner };
export type { ConnectionBannerProps };
