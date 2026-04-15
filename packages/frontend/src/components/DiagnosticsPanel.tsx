import { AlertTriangle, CircleX, Info } from 'lucide-react';
import { useEngineConnection } from '../stores/engine-connection.js';
import { useSelectionStore } from '../stores/selection.js';
import type { StructuredDiagnostic } from '../stores/simulation.js';
import { useSimulationStore } from '../stores/simulation.js';

const severityIcon: Record<StructuredDiagnostic['severity'], React.ReactNode> = {
  error: <CircleX className="size-3.5 shrink-0 text-red-400" />,
  warning: <AlertTriangle className="size-3.5 shrink-0 text-yellow-400" />,
  info: <Info className="size-3.5 shrink-0 text-blue-400" />,
};

function DiagnosticRow({ d }: { d: StructuredDiagnostic }) {
  const hasEntity = d.affectedEntityIds.length > 0;
  return (
    <button
      type="button"
      className={`flex items-start gap-2 rounded ps-2 pe-2 py-1 text-start text-2xs ${
        hasEntity ? 'cursor-pointer hover:bg-surface-hover' : 'cursor-default'
      }`}
      onClick={() => {
        if (hasEntity) {
          useSelectionStore.getState().select(d.affectedEntityIds[0]);
        }
      }}
    >
      {severityIcon[d.severity]}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-text-tertiary">{d.code}</span>
          <span
            className={
              d.severity === 'error'
                ? 'text-red-400'
                : d.severity === 'warning'
                  ? 'text-yellow-400'
                  : 'text-text-secondary'
            }
          >
            {d.message}
          </span>
        </div>
        {d.suggestion && <div className="mt-0.5 text-text-tertiary">{d.suggestion}</div>}
      </div>
    </button>
  );
}

function SummaryBar({ diagnostics }: { diagnostics: StructuredDiagnostic[] }) {
  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = diagnostics.filter((d) => d.severity === 'warning').length;
  const simState = useSimulationStore((s) => s.state);

  if (simState === 'idle' || diagnostics.length === 0) return null;

  let text: string;
  let color: string;
  if (errors > 0) {
    text = `Compilation failed: ${errors} error${errors > 1 ? 's' : ''}`;
    color = 'text-red-400';
  } else if (warnings > 0) {
    text = `Compiled with ${warnings} warning${warnings > 1 ? 's' : ''}`;
    color = 'text-yellow-400';
  } else {
    text = 'Compilation succeeded';
    color = 'text-green-400';
  }

  return (
    <div className={`ps-2 pe-2 py-1 text-2xs font-medium ${color} border-b border-border`}>
      {text}
    </div>
  );
}

export function DiagnosticsPanel() {
  const structuredDiagnostics = useSimulationStore((s) => s.structuredDiagnostics);
  const compilationError = useSimulationStore((s) => s.errorMessage);
  const engineStatus = useEngineConnection((s) => s.engineStatus);
  const engineError = useEngineConnection((s) => s.errorMessage);

  const hasContent =
    structuredDiagnostics.length > 0 || compilationError || engineError || engineStatus;

  if (!hasContent) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-text-tertiary">
        No diagnostics
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <SummaryBar diagnostics={structuredDiagnostics} />
      <div className="flex flex-col gap-0 overflow-auto p-1">
        {engineError && (
          <div className="flex items-center gap-2 ps-2 pe-2 py-1 text-2xs text-red-400">
            <CircleX className="size-3.5 shrink-0" />
            {engineError}
          </div>
        )}
        {engineStatus && !engineError && (
          <div className="ps-2 pe-2 py-0.5 text-2xs text-text-tertiary">Engine: {engineStatus}</div>
        )}
        {structuredDiagnostics.map((d, i) => (
          <DiagnosticRow key={`${d.code}-${i}`} d={d} />
        ))}
      </div>
    </div>
  );
}
