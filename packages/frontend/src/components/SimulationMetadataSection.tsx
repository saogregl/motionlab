import { InspectorSection, PropertyRow } from '@motionlab/ui';
import { getMeasuredFps } from '../engine/connection.js';
import { useSimulationStore } from '../stores/simulation.js';

const TIMESTEP = 1 / 60;

export function SimulationMetadataSection() {
  const simTime = useSimulationStore((s) => s.simTime);
  const stepCount = useSimulationStore((s) => s.stepCount);

  return (
    <InspectorSection title="Simulation">
      <PropertyRow label="Duration" unit="s" numeric>
        <span>{simTime.toFixed(3)}</span>
      </PropertyRow>
      <PropertyRow label="Step Count" numeric>
        <span>{stepCount}</span>
      </PropertyRow>
      <PropertyRow label="Timestep" unit="s" numeric>
        <span>{TIMESTEP.toFixed(6)}</span>
      </PropertyRow>
      <PropertyRow label="Solver">
        <span className="text-2xs">NSC</span>
      </PropertyRow>
      <PropertyRow label="Frame Rate" unit="fps" numeric>
        <span>{getMeasuredFps()}</span>
      </PropertyRow>
    </InspectorSection>
  );
}
