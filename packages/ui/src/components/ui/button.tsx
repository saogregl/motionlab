import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'group/button inline-flex shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-transparent bg-clip-padding font-medium whitespace-nowrap transition-all duration-[var(--duration-fast)] outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px disabled:pointer-events-none disabled:opacity-40 disabled:cursor-not-allowed aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-accent-primary text-text-inverse hover:bg-accent-hover active:bg-accent-pressed',
        outline:
          'border-border-default bg-bg-panel hover:bg-bg-subtle hover:text-text-primary aria-expanded:bg-bg-subtle dark:border-border-default dark:bg-bg-panel dark:hover:bg-bg-subtle',
        secondary:
          'bg-bg-subtle text-text-primary border border-border-default hover:bg-border-default active:bg-border-strong',
        ghost:
          'text-text-secondary hover:bg-hover-overlay hover:text-text-primary active:bg-pressed-overlay aria-expanded:bg-hover-overlay',
        destructive:
          'bg-danger text-text-inverse hover:bg-danger/90 active:bg-danger/80 focus-visible:border-danger/40 focus-visible:ring-danger/20',
        link: 'text-accent-primary underline-offset-4 hover:underline',
        toolbar: 'text-text-secondary hover:bg-hover-overlay active:bg-accent-soft',
        'toolbar-active':
          'bg-accent-soft text-accent-text hover:bg-accent-soft-hover active:bg-accent-soft',
        subtle: 'text-text-secondary hover:bg-bg-subtle active:bg-bg-inset',
      },
      size: {
        default:
          "h-7 gap-1.5 px-3 text-[length:var(--text-sm)] [&_svg:not([class*='size-'])]:size-4",
        xs: "h-5 gap-1 px-2 text-[length:var(--text-2xs)] [&_svg:not([class*='size-'])]:size-3",
        sm: "h-6 gap-1 px-2 text-[length:var(--text-xs)] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-8 gap-1.5 px-4 text-[length:var(--text-sm)] [&_svg:not([class*='size-'])]:size-4",
        icon: "size-7 [&_svg:not([class*='size-'])]:size-4",
        'icon-xs': "size-5 [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': "size-6 [&_svg:not([class*='size-'])]:size-3.5",
        'icon-lg': "size-8 [&_svg:not([class*='size-'])]:size-[18px]",
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
