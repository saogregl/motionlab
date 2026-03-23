import { InspectorSection, PropertyRow, formatEngValue } from '@motionlab/ui';
import { Activity } from 'lucide-react';
import { getMeasuredFps } from '../engine/connection.js';
import { useSimulationStore } from '../stores/simulation.js';

const TIMESTEP = 1 / 60;

export function SimulationMetadataSection() {
  const simTime = useSimulationStore((s) => s.simTime);
  const stepCount = useSimulationStore((s) => s.stepCount);

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
          {formatEngValue(TIMESTEP)}
        </span>
      </PropertyRow>
      <PropertyRow label="Solver">
        <span className="text-2xs">NSC</span>
      </PropertyRow>
      <PropertyRow label="Frame Rate" unit="fps" numeric>
        <span className="font-[family-name:var(--font-mono)] tabular-nums">{getMeasuredFps()}</span>
      </PropertyRow>
    </InspectorSection>
  );
}
