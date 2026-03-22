import { useSimulationStore } from '../stores/simulation.js';
import { useEngineConnection } from '../stores/engine-connection.js';

export function DiagnosticsPanel() {
  const compilationDiagnostics = useSimulationStore((s) => s.compilationDiagnostics);
  const compilationError = useSimulationStore((s) => s.errorMessage);
  const engineStatus = useEngineConnection((s) => s.engineStatus);
  const errorMessage = useEngineConnection((s) => s.errorMessage);

  const entries: { level: 'info' | 'warn' | 'error'; message: string }[] = [];

  if (engineStatus) {
    entries.push({ level: 'info', message: `Engine: ${engineStatus}` });
  }
  if (errorMessage) {
    entries.push({ level: 'error', message: errorMessage });
  }
  if (compilationError) {
    entries.push({ level: 'error', message: `Compilation: ${compilationError}` });
  }
  if (compilationDiagnostics) {
    for (const d of compilationDiagnostics) {
      entries.push({
        level: d.toLowerCase().startsWith('warning') ? 'warn' : 'info',
        message: d,
      });
    }
  }

  if (entries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-text-tertiary">
        No diagnostics
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0 overflow-auto p-2">
      {entries.map((entry, i) => (
        <div
          key={i}
          className={`font-mono text-2xs px-2 py-0.5 ${
            entry.level === 'error'
              ? 'text-red-400'
              : entry.level === 'warn'
                ? 'text-yellow-400'
                : 'text-text-secondary'
          }`}
        >
          {entry.message}
        </div>
      ))}
    </div>
  );
}
