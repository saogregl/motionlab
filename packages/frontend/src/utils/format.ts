/**
 * Format an ISO date string into a human-readable relative time.
 */
export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Truncate a file path for display, preserving the last 3 segments.
 */
export function truncatePath(filePath: string, maxLen = 60): string {
  if (filePath.length <= maxLen) return filePath;
  const parts = filePath.split('/');
  if (parts.length <= 3) return `\u2026${filePath.slice(-maxLen)}`;
  return `\u2026/${parts.slice(-3).join('/')}`;
}
