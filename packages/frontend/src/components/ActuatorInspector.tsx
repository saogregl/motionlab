import {
  InspectorPanel,
  InspectorSection,
  NumericInput,
  PropertyRow,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@motionlab/ui';
import { Cog, Settings2 } from 'lucide-react';
import { useMemo } from 'react';

import { sendUpdateActuator } from '../engine/connection.js';
import type { ActuatorState, ActuatorTypeId, CommandFunctionShape, ControlModeId } from '../stores/mechanism.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSelectionStore } from '../stores/selection.js';
import { useSimulationStore } from '../stores/simulation.js';
import { useTraceStore } from '../stores/traces.js';
import { getActuatorUnit } from '../utils/actuator-units.js';
import { getJointCoordinateChannelIds } from '../utils/runtime-channel-ids.js';
import { CommandFunctionSection, IdentitySection, SimulationValuesSection } from './inspector/sections/index.js';

function updateActuator(actuator: ActuatorState, updates: Partial<ActuatorState>): void {
  sendUpdateActuator({ ...actuator, ...updates });
}

export function ActuatorInspector({ actuatorId }: { actuatorId: string }) {
  const actuator = useMechanismStore((s) => s.actuators.get(actuatorId));
  const joint = useMechanismStore((s) =>
    actuator ? s.joints.get(actuator.jointId) : undefined,
  );

  const simState = useSimulationStore((s) => s.state);
  const channels = useTraceStore((s) => s.channels);
  const isSimulating = simState === 'running' || simState === 'paused';

  const select = useSelectionStore((s) => s.select);
  const setHovered = useSelectionStore((s) => s.setHovered);

  // Build channel definitions for SimulationValuesSection
  const channelDefs = useMemo(() => {
    if (!actuator || !joint) return [];
    const commandUnit = getActuatorUnit(actuator.type, actuator.controlMode);
    const effortUnit = actuator.type === 'revolute-motor' ? 'Nm' : 'N';
    const coordChannels = getJointCoordinateChannelIds(actuator.jointId, joint.type);
    return [
      ...(coordChannels?.position
        ? [{
            channelId: coordChannels.position,
            label: 'Actual Position',
            unit: channels.get(coordChannels.position)?.unit ?? '',
            type: 'scalar' as const,
          }]
        : []),
      ...(coordChannels?.velocity
        ? [{
            channelId: coordChannels.velocity,
            label: 'Actual Velocity',
            unit: channels.get(coordChannels.velocity)?.unit ?? '',
            type: 'scalar' as const,
          }]
        : []),
      {
        channelId: `actuator/${actuatorId}/command`,
        label: 'Commanded',
        unit: commandUnit,
        type: 'scalar' as const,
      },
      {
        channelId: `actuator/${actuatorId}/effort`,
        label: 'Applied Effort',
        unit: effortUnit,
        type: 'scalar' as const,
      },
    ];
  }, [actuator, actuatorId, joint, channels]);

  if (!actuator) return <InspectorPanel />;

  const commandUnit = getActuatorUnit(actuator.type, actuator.controlMode);
  const effortUnit = actuator.type === 'revolute-motor' ? 'Nm' : 'N';
  const hasEffortLimit = actuator.effortLimit !== undefined;

  return (
    <InspectorPanel
      entityName={actuator.name}
      entityType="Actuator"
      entityIcon={<Cog className="size-5" />}
    >
      <IdentitySection
        entityId={actuatorId}
        entityType="actuator"
        name={actuator.name}
        onRename={(newName) => updateActuator(actuator, { name: newName })}
        metadata={[
          {
            label: 'Type',
            value: (
              <span className="text-2xs">
                {actuator.type === 'revolute-motor' ? 'Revolute Motor' : 'Prismatic Motor'}
              </span>
            ),
          },
        ]}
        disabled={isSimulating}
      />

      {/* Configuration */}
      <InspectorSection title="Configuration" icon={<Settings2 className="size-3.5" />}>
        {joint && (
          <PropertyRow label="Joint">
            <button
              type="button"
              className="truncate cursor-pointer text-2xs hover:underline"
              onClick={() => select(joint.id)}
              onMouseEnter={() => setHovered(joint.id)}
              onMouseLeave={() => setHovered(null)}
              title={joint.name}
            >
              {joint.name}
            </button>
          </PropertyRow>
        )}
        <PropertyRow label="Control Mode">
          <Select
            value={actuator.controlMode}
            onValueChange={(v) =>
              updateActuator(actuator, { controlMode: v as ControlModeId })
            }
          >
            <SelectTrigger size="sm" disabled={isSimulating}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="position">Position</SelectItem>
              <SelectItem value="speed">Speed</SelectItem>
              <SelectItem value="effort">Effort</SelectItem>
            </SelectContent>
          </Select>
        </PropertyRow>
        <PropertyRow label="Effort Limit">
          <div className="flex items-center gap-1.5">
            <Switch
              checked={hasEffortLimit}
              onCheckedChange={(checked) =>
                updateActuator(actuator, {
                  effortLimit: checked ? actuator.effortLimit ?? 100 : undefined,
                })
              }
              disabled={isSimulating}
            />
            {hasEffortLimit && (
              <NumericInput
                variant="inline"
                value={actuator.effortLimit ?? 0}
                onChange={(v) => updateActuator(actuator, { effortLimit: v })}
                min={0}
                step={1}
                precision={2}
                unit={effortUnit}
                disabled={isSimulating}
              />
            )}
          </div>
        </PropertyRow>
      </InspectorSection>

      <CommandFunctionSection
        fn={actuator.commandFunction}
        onChange={(commandFunction: CommandFunctionShape) => {
          const commandValue = commandFunction.shape === 'constant' ? commandFunction.value : actuator.commandValue;
          updateActuator(actuator, { commandFunction, commandValue });
        }}
        unit={commandUnit}
        disabled={isSimulating}
      />

      <SimulationValuesSection channelDefinitions={channelDefs} />
    </InspectorPanel>
  );
}
