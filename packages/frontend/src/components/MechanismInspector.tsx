import { InspectorPanel, InspectorSection, PropertyRow } from '@motionlab/ui';
import { AlertTriangle, Anchor, CircleX, Info } from 'lucide-react';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSimulationStore } from '../stores/simulation.js';

const severityIcon = {
  error: <CircleX className="size-3 text-red-400" />,
  warning: <AlertTriangle className="size-3 text-yellow-400" />,
  info: <Info className="size-3 text-blue-400" />,
};

export function MechanismInspector() {
  const bodies = useMechanismStore((s) => s.bodies);
  const simState = useSimulationStore((s) => s.state);
  const structuredDiagnostics = useSimulationStore((s) => s.structuredDiagnostics);

  const groundBody = [...bodies.values()].find((b) => b.motionType === 'fixed');

  return (
    <InspectorPanel entityName="Mechanism" entityType="Overview">
      <InspectorSection title="Ground" icon={<Anchor className="size-3.5" />}>
        <PropertyRow label="Ground Body">
          <span className="text-2xs truncate">{groundBody?.name ?? 'None (required)'}</span>
        </PropertyRow>
      </InspectorSection>
      {simState !== 'idle' && structuredDiagnostics.length > 0 && (
        <InspectorSection title="Last Compilation" icon={<AlertTriangle className="size-3.5" />}>
          {structuredDiagnostics.map((d, i) => (
            <PropertyRow
              key={i}
              label={<span className="flex items-center">{severityIcon[d.severity]}</span>}
            >
              <span className="text-[length:var(--text-2xs)] text-[var(--text-secondary)]">
                {d.message}
              </span>
            </PropertyRow>
          ))}
        </InspectorSection>
      )}
    </InspectorPanel>
  );
}
