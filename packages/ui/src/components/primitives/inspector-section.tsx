import { Collapsible } from '@base-ui/react/collapsible';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../../lib/utils';

interface InspectorSectionProps {
  /** Section title */
  title: string;
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
      className={cn('border-b border-[var(--border-default)]', className)}
    >
      <Collapsible.Trigger
        data-slot="inspector-section-trigger"
        className="flex h-7 w-full items-center gap-1 bg-[var(--layer-recessed)] px-1.5 text-[length:var(--text-2xs)] font-semibold uppercase tracking-[0.05em] text-[var(--text-secondary)] hover:bg-[var(--layer-recessed-hover)]"
      >
        <ChevronRight className="size-2.5 shrink-0 transition-transform duration-[var(--duration-normal)] [[data-open]>&]:rotate-90" />
        {title}
      </Collapsible.Trigger>
      <Collapsible.Panel
        data-slot="inspector-section-panel"
        className="overflow-hidden bg-[var(--layer-raised)] transition-[height] duration-[var(--duration-normal)] ease-[var(--easing-default)]"
      >
        {children}
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

export { InspectorSection };
export type { InspectorSectionProps };
