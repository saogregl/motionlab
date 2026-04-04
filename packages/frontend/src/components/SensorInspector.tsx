import {
  InspectorPanel,
  InspectorSection,
  PropertyRow,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@motionlab/ui';
import { Radio } from 'lucide-react';
import { useMemo } from 'react';

import { sendDeleteSensor, sendUpdateSensor } from '../engine/connection.js';
import type { SensorState, SensorAxisId } from '../stores/mechanism.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSimulationStore } from '../stores/simulation.js';
import { useTraceStore } from '../stores/traces.js';
import { IdentitySection, SimulationValuesSection } from './inspector/sections/index.js';

function updateSensor(sensor: SensorState, updates: Partial<SensorState>): void {
  sendUpdateSensor({ ...sensor, ...updates });
}

const sensorTypeLabels: Record<SensorState['type'], string> = {
  accelerometer: 'Accelerometer',
  gyroscope: 'Gyroscope',
  tachometer: 'Tachometer',
  encoder: 'Encoder',
};

export function SensorInspector({ sensorId }: { sensorId: string }) {
  const sensor = useMechanismStore((s) => s.sensors.get(sensorId));
  const datum = useMechanismStore((s) =>
    sensor ? s.datums.get(sensor.datumId) : undefined,
  );
  const joint = useMechanismStore((s) =>
    sensor?.jointId ? s.joints.get(sensor.jointId) : undefined,
  );

  const simState = useSimulationStore((s) => s.state);
  const channels = useTraceStore((s) => s.channels);
  const isSimulating = simState === 'running' || simState === 'paused';

  const channelDefinitions = useMemo(() => {
    if (!sensor) return [];
    const prefix = `sensor/${sensorId}/`;
    switch (sensor.type) {
      case 'accelerometer':
        return [
          { channelId: prefix + 'acceleration', label: 'Acceleration', unit: 'm/s²', type: 'vec3' as const },
        ];
      case 'gyroscope':
        return [
          { channelId: prefix + 'angular_velocity', label: 'Angular Velocity', unit: 'rad/s', type: 'vec3' as const },
        ];
      case 'tachometer':
        return [
          { channelId: prefix + 'rpm', label: 'RPM', unit: 'rpm', type: 'scalar' as const },
        ];
      case 'encoder':
        return [
          { channelId: prefix + 'position', label: 'Position', unit: joint?.type === 'prismatic' ? 'm' : 'rad', type: 'scalar' as const },
          { channelId: prefix + 'velocity', label: 'Velocity', unit: joint?.type === 'prismatic' ? 'm/s' : 'rad/s', type: 'scalar' as const },
        ];
      default:
        return [];
    }
  }, [sensor, sensorId, joint, channels]);

  if (!sensor) return null;

  return (
    <InspectorPanel>
      <IdentitySection
        entityId={sensorId}
        entityType="sensor"
        name={sensor.name}
        onRename={(name) => updateSensor(sensor, { name })}
      />

      <InspectorSection title="Configuration" icon={<Radio className="size-3.5 text-muted-foreground" />}>
        <PropertyRow label="Type">
          <span className="text-sm text-muted-foreground">{sensorTypeLabels[sensor.type]}</span>
        </PropertyRow>

        {datum && (
          <PropertyRow label="Datum">
            <span className="text-sm text-muted-foreground">{datum.name}</span>
          </PropertyRow>
        )}

        {sensor.type === 'tachometer' && (
          <PropertyRow label="Axis">
            <Select
              value={sensor.axis ?? 'z'}
              onValueChange={(v) => updateSensor(sensor, { axis: v as SensorAxisId })}
            >
              <SelectTrigger className="h-7 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="x">X</SelectItem>
                <SelectItem value="y">Y</SelectItem>
                <SelectItem value="z">Z</SelectItem>
              </SelectContent>
            </Select>
          </PropertyRow>
        )}

        {sensor.type === 'encoder' && joint && (
          <PropertyRow label="Joint">
            <span className="text-sm text-muted-foreground">{joint.name}</span>
          </PropertyRow>
        )}
      </InspectorSection>

      {isSimulating && channelDefinitions.length > 0 && (
        <SimulationValuesSection channelDefinitions={channelDefinitions} />
      )}
    </InspectorPanel>
  );
}
