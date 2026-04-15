import { cn } from '../../lib/utils';

interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  unit?: string;
  disabled?: boolean;
  onChange?: (value: number) => void;
  className?: string;
}

function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  label,
  unit,
  disabled,
  onChange,
  className,
}: SliderProps) {
  const percent = ((value - min) / (max - min)) * 100;

  return (
    <div data-slot="slider" className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <div className="flex items-baseline justify-between">
          <span className="text-[length:var(--text-3xs)] font-medium text-[var(--text-secondary)]">
            {label}
          </span>
          <span className="text-[length:var(--text-2xs)] tabular-nums text-[var(--text-primary)]">
            {value}
            {unit ? ` ${unit}` : ''}
          </span>
        </div>
      )}
      <div className="relative flex h-[10px] items-center">
        {/* Track background */}
        <div className="absolute inset-x-0 h-1 rounded-full bg-[var(--layer-raised)]" />
        {/* Track fill */}
        <div
          className="absolute inset-y-auto start-0 h-1 rounded-full bg-[var(--accent-primary)]"
          style={{ width: `${percent}%` }}
        />
        {/* Native range input (invisible but functional) */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange?.(Number(e.target.value))}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none bg-transparent
            [&::-webkit-slider-thumb]:size-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_1px_3px_rgba(0,0,0,0.3)]
            [&::-moz-range-thumb]:size-2.5 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-[0_1px_3px_rgba(0,0,0,0.3)]
            disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
    </div>
  );
}

export { Slider };
export type { SliderProps };
