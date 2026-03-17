import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

interface TimelineScrubberProps {
  currentTime: number;
  duration: number;
  onSeek?: (time: number) => void;
  /** Interval between tick marks in seconds */
  tickInterval?: number;
  className?: string;
}

function TimelineScrubber({
  currentTime,
  duration,
  onSeek,
  tickInterval,
  className,
}: TimelineScrubberProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const effectiveTick = tickInterval ?? (duration > 0 ? duration / 10 : 0.2);

  const calculateTime = useCallback(
    (clientX: number) => {
      if (!trackRef.current || duration <= 0) return 0;
      const rect = trackRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const time = calculateTime(e.clientX);
      onSeek?.(time);
      setIsDragging(true);
    },
    [calculateTime, onSeek],
  );

  useEffect(() => {
    if (!isDragging) return;

    function handleMouseMove(e: MouseEvent) {
      const time = calculateTime(e.clientX);
      onSeek?.(time);
    }

    function handleMouseUp() {
      setIsDragging(false);
    }

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, calculateTime, onSeek]);

  // Generate tick values
  const ticks: number[] = [];
  if (duration > 0 && effectiveTick > 0) {
    for (let t = 0; t <= duration; t += effectiveTick) {
      ticks.push(Math.round(t * 1000) / 1000);
    }
    // Ensure the last tick is exactly duration
    if (ticks[ticks.length - 1] !== duration) {
      ticks.push(duration);
    }
  }

  const playheadPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div data-slot="timeline-scrubber" className={cn('flex flex-col gap-1', className)}>
      {/* Track */}
      <div
        ref={trackRef}
        data-slot="timeline-scrubber-track"
        className="relative h-3 cursor-pointer border border-[var(--border-subtle)] bg-[var(--field-base)] rounded-[1px]"
        onMouseDown={handleMouseDown}
      >
        {/* Playhead */}
        <div
          data-slot="timeline-scrubber-playhead"
          className="absolute top-0 h-full w-0.5 bg-[var(--accent-primary)]"
          style={{ left: `${playheadPercent}%` }}
        >
          {/* Circle handle */}
          <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 size-2.5 rounded-full bg-[var(--accent-primary)] shadow-[0_0_3px_rgba(0,0,0,0.3)]" />
        </div>
      </div>

      {/* Tick labels */}
      {ticks.length > 0 && (
        <div data-slot="timeline-scrubber-ticks" className="flex justify-between px-0.5">
          {ticks.map((t) => (
            <span
              key={t}
              className="font-[family-name:var(--font-mono)] text-[10px] text-[var(--text-tertiary)] tabular-nums"
            >
              {t.toFixed(1)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export { TimelineScrubber };
export type { TimelineScrubberProps };
