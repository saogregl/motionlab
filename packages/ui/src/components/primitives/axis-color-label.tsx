import { cn } from '@/lib/utils';

type Axis = 'x' | 'y' | 'z';

interface AxisColorLabelProps {
  axis: Axis;
  className?: string;
}

const AXIS_CONFIG: Record<Axis, { token: string; label: string }> = {
  x: { token: 'var(--axis-x)', label: 'X' },
  y: { token: 'var(--axis-y)', label: 'Y' },
  z: { token: 'var(--axis-z)', label: 'Z' },
};

function AxisColorLabel({ axis, className }: AxisColorLabelProps) {
  const config = AXIS_CONFIG[axis];
  return (
    <span
      data-slot="axis-color-label"
      className={cn(
        'inline-flex shrink-0 text-[11px] font-bold',
        className,
      )}
      style={{ color: config.token }}
    >
      {config.label}
    </span>
  );
}

export { AxisColorLabel };
export type { AxisColorLabelProps, Axis };
