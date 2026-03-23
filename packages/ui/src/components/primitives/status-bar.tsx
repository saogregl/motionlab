import { cn } from '../../lib/utils';

type ConnectionState = 'connected' | 'connecting' | 'disconnected' | 'error';
type SimulationState = 'idle' | 'compiling' | 'running' | 'paused' | 'error';

interface StatusBarProps {
  /** Engine connection state */
  connectionState: ConnectionState;
  /** Simulation state */
  simulationState: SimulationState;
  /** Current simulation time (seconds) */
  currentTime?: number;
  /** Total simulation duration (seconds) */
  duration?: number;
  /** Entity counts */
  entityCounts?: {
    bodies: number;
    joints: number;
    loads?: number;
  };
  className?: string;
}

const CONNECTION_DOT: Record<ConnectionState, string> = {
  connected: 'bg-[var(--success)]',
  connecting: 'bg-[var(--warning)] animate-pulse',
  disconnected: 'bg-[var(--text-disabled)]',
  error: 'bg-[var(--danger)]',
};

const CONNECTION_LABEL: Record<ConnectionState, string> = {
  connected: 'Connected',
  connecting: 'Connecting',
  disconnected: 'Disconnected',
  error: 'Error',
};

const SIM_DOT: Record<SimulationState, string> = {
  idle: 'bg-[var(--text-tertiary)]',
  compiling: 'bg-[var(--warning)] animate-pulse',
  running: 'bg-[var(--status-running)] animate-pulse',
  paused: 'bg-[var(--text-secondary)]',
  error: 'bg-[var(--danger)]',
};

const SIM_LABEL: Record<SimulationState, string> = {
  idle: 'Idle',
  compiling: 'Compiling',
  running: 'Running',
  paused: 'Paused',
  error: 'Error',
};

function formatTime(seconds: number): string {
  return seconds.toFixed(3);
}

function Separator() {
  return <span className="w-px h-3 bg-[var(--border-subtle)]" />;
}

function StatusDot({ className }: { className: string }) {
  return <span className={cn('size-1.5 shrink-0 rounded-full', className)} />;
}

function StatusBar({
  connectionState,
  simulationState,
  currentTime,
  duration,
  entityCounts,
  className,
}: StatusBarProps) {
  const showTime = duration != null && duration > 0;

  return (
    <div
      data-slot="status-bar"
      className={cn(
        'flex h-[var(--statusbar-h)] shrink-0 items-center border-t border-[var(--border-default)] bg-[var(--layer-recessed)] ps-3 pe-3',
        className,
      )}
    >
      {/* Left cluster */}
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-status text-[var(--text-secondary)]">
          <StatusDot className={CONNECTION_DOT[connectionState]} />
          {CONNECTION_LABEL[connectionState]}
        </span>

        <Separator />

        <span className="inline-flex items-center gap-1.5 text-status text-[var(--text-secondary)]">
          <StatusDot className={SIM_DOT[simulationState]} />
          {SIM_LABEL[simulationState]}
        </span>
      </div>

      {/* Center — time readout */}
      <div className="flex-1 text-center">
        {showTime && (
          <span className="font-[family-name:var(--font-mono)] text-[length:var(--text-3xs)] tabular-nums text-[var(--text-secondary)]">
            t={formatTime(currentTime ?? 0)} / {formatTime(duration)}s
          </span>
        )}
      </div>

      {/* Right cluster — entity counts */}
      {entityCounts && (
        <div className="flex items-center gap-2 text-status text-[var(--text-tertiary)]">
          <span>{entityCounts.bodies} bodies</span>
          <Separator />
          <span>{entityCounts.joints} joints</span>
          {entityCounts.loads != null && entityCounts.loads > 0 && (
            <>
              <Separator />
              <span>{entityCounts.loads} loads</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export { StatusBar };
export type { StatusBarProps };
