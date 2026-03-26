import {
  InspectorSection,
  PropertyRow,
  Vec3Display,
  formatEngValue,
} from '@motionlab/ui';
import { Activity } from 'lucide-react';

import { useSimulationStore } from '../../../stores/simulation.js';
import { useTraceStore } from '../../../stores/traces.js';
import { nearestSample } from '../../../utils/nearest-sample.js';

interface ChannelDefinition {
  channelId: string;
  label: string;
  unit: string;
  type?: 'scalar' | 'vec3';
}

interface SimulationValuesSectionProps {
  channelDefinitions: ChannelDefinition[];
  title?: string;
}

function SimulationValuesSection({
  channelDefinitions,
  title = 'Simulation Values',
}: SimulationValuesSectionProps) {
  const simState = useSimulationStore((s) => s.state);
  const simTime = useSimulationStore((s) => s.simTime);
  const traces = useTraceStore((s) => s.traces);
  const channels = useTraceStore((s) => s.channels);

  if (simState !== 'running' && simState !== 'paused') {
    return null;
  }

  return (
    <InspectorSection title={title} icon={<Activity className="size-3.5" />}>
      {channelDefinitions.map((def) => {
        const channelType = def.type ?? 'scalar';
        const samples = traces.get(def.channelId);
        const hasChannel = channels.has(def.channelId);
        const val = samples ? nearestSample(samples, simTime) : undefined;

        if (channelType === 'vec3') {
          if (val?.vec) {
            return (
              <Vec3Display
                key={def.channelId}
                label={def.label}
                value={val.vec}
                unit={def.unit}
              />
            );
          }
          if (hasChannel) {
            return (
              <PropertyRow key={def.channelId} label={def.label}>
                <span className="text-2xs text-text-tertiary">Awaiting data...</span>
              </PropertyRow>
            );
          }
          return (
            <PropertyRow key={def.channelId} label={def.label}>
              <span className="text-2xs text-text-tertiary">Not available</span>
            </PropertyRow>
          );
        }

        // scalar
        if (val !== undefined) {
          return (
            <PropertyRow key={def.channelId} label={def.label} unit={def.unit} numeric>
              <span className="font-[family-name:var(--font-mono)] tabular-nums">
                {formatEngValue(val.value)}
              </span>
            </PropertyRow>
          );
        }
        if (hasChannel) {
          return (
            <PropertyRow key={def.channelId} label={def.label}>
              <span className="text-2xs text-text-tertiary">Awaiting data...</span>
            </PropertyRow>
          );
        }
        return (
          <PropertyRow key={def.channelId} label={def.label}>
            <span className="text-2xs text-text-tertiary">Not available</span>
          </PropertyRow>
        );
      })}
    </InspectorSection>
  );
}

export { SimulationValuesSection };
export type { SimulationValuesSectionProps, ChannelDefinition };
