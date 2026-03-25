import { Collapsible } from '@base-ui/react/collapsible';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../../lib/utils';

interface InspectorSectionProps {
  /** Section title */
  title: string;
  /** Optional icon next to the section title */
  icon?: ReactNode;
  /** Optional count badge shown after title */
  count?: number;
  /** Controlled open state */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Default open state (uncontrolled) */
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

function InspectorSection({
  title,
  icon,
  count,
  open,
  onOpenChange,
  defaultOpen = true,
  children,
  className,
}: InspectorSectionProps) {
  return (
    <Collapsible.Root
      data-slot="inspector-section"
      open={open}
      onOpenChange={onOpenChange}
      defaultOpen={defaultOpen}
      className={cn('rounded-[var(--section-radius)] border border-[var(--border-default)] bg-[var(--layer-recessed)]', className)}
    >
      <Collapsible.Trigger
        data-slot="inspector-section-trigger"
        className="flex h-7 w-full items-center gap-1 ps-2 pe-2 text-[length:var(--text-xs)] font-semibold tracking-[0.02em] text-text-primary hover:bg-[var(--layer-recessed-hover)]"
      >
        <ChevronRight className="size-2 shrink-0 transition-transform duration-[var(--duration-normal)] [[data-open]>&]:rotate-90" />
        {icon && (
          <span className="flex size-3.5 shrink-0 items-center justify-center text-[var(--text-tertiary)]">
            {icon}
          </span>
        )}
        {title}
        {count != null && (
          <span className="text-[var(--text-tertiary)] font-normal">({count})</span>
        )}
      </Collapsible.Trigger>
      <Collapsible.Panel
        data-slot="inspector-section-panel"
        className="overflow-hidden rounded-b-[var(--section-radius)] bg-[var(--layer-base)] px-1 pb-1.5 pt-0.5 transition-[height] duration-[var(--duration-normal)] ease-[var(--easing-default)]"
      >
        {children}
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

export { InspectorSection };
export type { InspectorSectionProps };
