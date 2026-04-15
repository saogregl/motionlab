import { formatEngValue, InspectorSection, PropertyRow } from '@motionlab/ui';
import { Activity } from 'lucide-react';
import { getMeasuredFps } from '../engine/connection.js';
import { useSimulationStore } from '../stores/simulation.js';
import { useSimulationSettingsStore } from '../stores/simulation-settings.js';

const SOLVER_LABELS: Record<string, string> = {
  psor: 'PSOR',
  'barzilai-borwein': 'BB',
  apgd: 'APGD',
  minres: 'MINRES',
};

const INTEGRATOR_LABELS: Record<string, string> = {
  'euler-implicit-linearized': 'Euler Implicit',
  hht: 'HHT',
  newmark: 'Newmark',
};

export function SimulationMetadataSection() {
  const simTime = useSimulationStore((s) => s.simTime);
  const stepCount = useSimulationStore((s) => s.stepCount);
  const timestep = useSimulationSettingsStore((s) => s.timestep);
  const solverType = useSimulationSettingsStore((s) => s.solverType);
  const maxIterations = useSimulationSettingsStore((s) => s.maxIterations);
  const tolerance = useSimulationSettingsStore((s) => s.tolerance);
  const integratorType = useSimulationSettingsStore((s) => s.integratorType);
  const enableContact = useSimulationSettingsStore((s) => s.enableContact);
  const friction = useSimulationSettingsStore((s) => s.friction);

  const solverLabel = SOLVER_LABELS[solverType] ?? solverType;
  const integratorLabel = INTEGRATOR_LABELS[integratorType] ?? integratorType;

  return (
    <InspectorSection title="Simulation" icon={<Activity className="size-3.5" />}>
      <PropertyRow label="Duration" unit="s" numeric>
        <span className="font-[family-name:var(--font-mono)] tabular-nums">
          {formatEngValue(simTime)}
        </span>
      </PropertyRow>
      <PropertyRow label="Step Count" numeric>
        <span className="font-[family-name:var(--font-mono)] tabular-nums">{stepCount}</span>
      </PropertyRow>
      <PropertyRow label="Timestep" unit="s" numeric>
        <span className="font-[family-name:var(--font-mono)] tabular-nums">
          {formatEngValue(timestep)}
        </span>
      </PropertyRow>
      <PropertyRow label="Solver">
        <span className="text-2xs">
          {solverLabel} ({maxIterations} iter, tol {formatEngValue(tolerance)})
        </span>
      </PropertyRow>
      <PropertyRow label="Integrator">
        <span className="text-2xs">{integratorLabel}</span>
      </PropertyRow>
      <PropertyRow label="Contact">
        <span className="text-2xs">
          {enableContact ? `Enabled (\u03BC=${friction.toFixed(2)})` : 'Disabled'}
        </span>
      </PropertyRow>
      <PropertyRow label="Frame Rate" unit="fps" numeric>
        <span className="font-[family-name:var(--font-mono)] tabular-nums">{getMeasuredFps()}</span>
      </PropertyRow>
    </InspectorSection>
  );
}
