import { cn } from '@motionlab/ui';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';

interface CollapsibleSectionProps {
  title: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  /** Background class applied to the entire section when open */
  bgClassName?: string;
  children?: ReactNode;
  className?: string;
}

function CollapsibleSection({
  title,
  icon,
  defaultOpen = true,
  bgClassName,
  children,
  className,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn('border-b border-border-default', open && bgClassName, className)}>
      <button
        type="button"
        className="flex w-full items-center gap-1.5 ps-4 pe-4 py-2.5 text-[length:var(--text-sm)] text-text-primary transition-colors hover:bg-layer-base-hover/50"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="size-3.5 shrink-0 text-text-tertiary transition-transform duration-[var(--duration-normal)]" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-text-tertiary transition-transform duration-[var(--duration-normal)]" />
        )}
        {icon && (
          <span className="flex size-4 shrink-0 items-center justify-center text-text-tertiary">
            {icon}
          </span>
        )}
        <span>{title}</span>
      </button>
      {open && children}
    </div>
  );
}

export { CollapsibleSection };
export type { CollapsibleSectionProps };
