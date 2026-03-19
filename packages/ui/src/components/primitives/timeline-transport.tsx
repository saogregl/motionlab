import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Repeat,
  SkipBack,
  SkipForward,
} from 'lucide-react';

import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

interface TimelineTransportProps {
  isPlaying: boolean;
  isLooping: boolean;
  speed: number;
  currentTime: number;
  duration: number;
  onPlayPause?: () => void;
  onStepForward?: () => void;
  onStepBack?: () => void;
  onSkipForward?: () => void;
  onSkipBack?: () => void;
  onLoopToggle?: () => void;
  onSpeedChange?: (speed: number) => void;
  className?: string;
}

const speedOptions = [0.25, 0.5, 1, 2, 4] as const;

function formatTime(seconds: number): string {
  return `${seconds.toFixed(3)}s`;
}

function TimelineTransport({
  isPlaying,
  isLooping,
  speed,
  currentTime,
  duration,
  onPlayPause,
  onStepForward,
  onStepBack,
  onSkipForward,
  onSkipBack,
  onLoopToggle,
  onSpeedChange,
  className,
}: TimelineTransportProps) {
  return (
    <div
      data-slot="timeline-transport"
      className={cn('flex items-center gap-1.5 h-8 px-1.5', className)}
    >
      {/* Transport buttons */}
      <div data-slot="timeline-transport-buttons" className="flex items-center gap-px">
        <Button variant="toolbar" size="icon-sm" onClick={onSkipBack} aria-label="Skip to start">
          <SkipBack />
        </Button>
        <Button variant="toolbar" size="icon-sm" onClick={onStepBack} aria-label="Step back">
          <ChevronLeft />
        </Button>
        <Button
          variant="toolbar"
          size="icon-sm"
          onClick={onPlayPause}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause /> : <Play />}
        </Button>
        <Button variant="toolbar" size="icon-sm" onClick={onStepForward} aria-label="Step forward">
          <ChevronRight />
        </Button>
        <Button variant="toolbar" size="icon-sm" onClick={onSkipForward} aria-label="Skip to end">
          <SkipForward />
        </Button>
      </div>

      {/* Loop toggle */}
      <Button
        variant={isLooping ? 'toolbar-active' : 'toolbar'}
        size="icon-sm"
        onClick={onLoopToggle}
        aria-label={isLooping ? 'Disable loop' : 'Enable loop'}
        aria-pressed={isLooping}
      >
        <Repeat />
      </Button>

      {/* Speed selector */}
      <div data-slot="timeline-transport-speed" className="flex items-center gap-1">
        <span className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">Speed</span>
        <Select value={String(speed)} onValueChange={(val) => val && onSpeedChange?.(Number(val))}>
          <SelectTrigger size="sm" className="w-[68px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {speedOptions.map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s}&times;
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Time readout */}
      <span
        data-slot="timeline-transport-time"
        className="ml-auto bg-[var(--field-base)] px-2 py-0.5 rounded-[var(--radius-sm)] font-[family-name:var(--font-mono)] text-[length:var(--text-sm)] tabular-nums text-[var(--text-primary)]"
      >
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
    </div>
  );
}

export { TimelineTransport };
export type { TimelineTransportProps };
