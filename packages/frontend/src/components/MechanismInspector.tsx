import { InspectorPanel, InspectorSection, PropertyRow } from '@motionlab/ui';
import { AlertTriangle } from 'lucide-react';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSimulationStore } from '../stores/simulation.js';

export function MechanismInspector() {
  const bodies = useMechanismStore((s) => s.bodies);
  const simState = useSimulationStore((s) => s.state);
  const compilationDiagnostics = useSimulationStore((s) => s.compilationDiagnostics);

  const groundBody = [...bodies.values()].find((b) => b.isFixed);

  return (
    <InspectorPanel entityName="Mechanism" entityType="Overview">
      <InspectorSection title="Ground">
        <PropertyRow label="Ground Body">
          <span className="text-2xs truncate">{groundBody?.name ?? 'First body (default)'}</span>
        </PropertyRow>
      </InspectorSection>
      {simState !== 'idle' && compilationDiagnostics && compilationDiagnostics.length > 0 && (
        <InspectorSection title="Last Compilation">
          {compilationDiagnostics.map((d, i) => (
            <PropertyRow
              key={i}
              label={
                <span className="flex items-center">
                  <AlertTriangle className="size-3 text-[var(--warning)]" />
                </span>
              }
            >
              <span className="text-[length:var(--text-2xs)] text-[var(--text-secondary)]">{d}</span>
            </PropertyRow>
          ))}
        </InspectorSection>
      )}
    </InspectorPanel>
  );
}
