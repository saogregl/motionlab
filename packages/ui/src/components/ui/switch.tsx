import { Switch as SwitchPrimitive } from '@base-ui/react/switch';

import { cn } from '../../lib/utils';

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer group/switch relative inline-flex h-[14px] w-[28px] shrink-0 items-center rounded-full border border-transparent transition-all outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-checked:bg-[var(--accent-primary)] data-unchecked:bg-[var(--layer-raised)] data-disabled:cursor-not-allowed data-disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-2.5 rounded-full ring-0 transition-[transform,background-color] data-checked:translate-x-[calc(100%+4px)] data-checked:bg-[var(--accent-primary)] data-unchecked:translate-x-0.5 data-unchecked:bg-[var(--text-secondary)]"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
