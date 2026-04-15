import { Check, Copy } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { cn } from '../../lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

interface CopyableIdProps {
  /** Full ID string */
  value: string;
  /** Characters to show before truncation (default 12) */
  truncateAt?: number;
  className?: string;
}

function CopyableId({ value, truncateAt = 12, className }: CopyableIdProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 1500);
    });
  }, [value]);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className={cn(
              'group/copyid inline-flex items-center gap-1 text-[length:var(--text-xs)] font-[family-name:var(--font-mono)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-[var(--duration-fast)]',
              className,
            )}
            onClick={handleCopy}
          />
        }
      >
        <span className="truncate">{value.slice(0, truncateAt)}&hellip;</span>
        {copied ? (
          <Check className="size-3 shrink-0 text-[var(--success)]" />
        ) : (
          <Copy className="size-3 shrink-0 opacity-0 group-hover/copyid:opacity-100 text-[var(--text-tertiary)]" />
        )}
      </TooltipTrigger>
      <TooltipContent side="left">{copied ? 'Copied!' : 'Click to copy full ID'}</TooltipContent>
    </Tooltip>
  );
}

export { CopyableId };
export type { CopyableIdProps };
