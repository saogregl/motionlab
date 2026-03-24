import {
  CopyableId,
  InlineEditableName,
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
  formatEngValue,
} from '@motionlab/ui';
import { Activity, Cog, Fingerprint, Settings2 } from 'lucide-react';
import { useCallback, useState } from 'react';

import { sendUpdateActuator } from '../engine/connection.js';
import type { ActuatorState, ActuatorTypeId, ControlModeId } from '../stores/mechanism.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSelectionStore } from '../stores/selection.js';
import { useSimulationStore } from '../stores/simulation.js';
import { useTraceStore } from '../stores/traces.js';
import { nearestSample } from '../utils/nearest-sample.js';
import { getJointCoordinateChannelIds } from '../utils/runtime-channel-ids.js';

function getActuatorUnit(actuatorType: ActuatorTypeId, controlMode: ControlModeId): string {
  const isRevolute = actuatorType === 'revolute-motor';
  switch (controlMode) {
    case 'position':
      return isRevolute ? 'rad' : 'm';
    case 'speed':
      return isRevolute ? 'rad/s' : 'm/s';
    case 'effort':
      return isRevolute ? 'Nm' : 'N';
  }
}

function updateActuator(actuator: ActuatorState, updates: Partial<ActuatorState>): void {
  sendUpdateActuator({ ...actuator, ...updates });
}

export function ActuatorInspector({ actuatorId }: { actuatorId: string }) {
  const actuator = useMechanismStore((s) => s.actuators.get(actuatorId));
  const joint = useMechanismStore((s) =>
    actuator ? s.joints.get(actuator.jointId) : undefined,
  );

  const simState = useSimulationStore((s) => s.state);
  const simTime = useSimulationStore((s) => s.simTime);
  const traces = useTraceStore((s) => s.traces);
  const channels = useTraceStore((s) => s.channels);
  const isSimulating = simState === 'running' || simState === 'paused';

  const select = useSelectionStore((s) => s.select);
  const setHovered = useSelectionStore((s) => s.setHovered);

  const [editingName, setEditingName] = useState(false);

  const startEditName = useCallback(() => {
    if (!actuator || isSimulating) return;
    setEditingName(true);
  }, [actuator, isSimulating]);

  const commitName = useCallback(
    (newName: string) => {
      if (actuator && newName !== actuator.name) {
        updateActuator(actuator, { name: newName });
      }
      setEditingName(false);
    },
    [actuator],
  );

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
      {/* Identity */}
      <InspectorSection title="Identity" icon={<Fingerprint className="size-3.5" />}>
        <PropertyRow label="Name">
          <InlineEditableName
            value={actuator.name}
            isEditing={editingName}
            onStartEdit={startEditName}
            onCommit={commitName}
            onCancel={() => setEditingName(false)}
          />
        </PropertyRow>
        <PropertyRow label="Type">
          <span className="text-2xs">
            {actuator.type === 'revolute-motor' ? 'Revolute Motor' : 'Prismatic Motor'}
          </span>
        </PropertyRow>
        <PropertyRow label="Actuator ID">
          <CopyableId value={actuatorId} />
        </PropertyRow>
      </InspectorSection>

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
        <PropertyRow label="Command" unit={commandUnit} numeric>
          <NumericInput
            variant="inline"
            value={actuator.commandValue}
            onChange={(v) => updateActuator(actuator, { commandValue: v })}
            step={actuator.controlMode === 'position' ? 0.1 : actuator.controlMode === 'speed' ? 0.1 : 1}
            precision={4}
            disabled={isSimulating}
          />
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

      {/* Simulation Values */}
      {isSimulating &&
        (() => {
          const jointId = actuator.jointId;
          const coordChannels = joint ? getJointCoordinateChannelIds(jointId, joint.type) : null;
          const posId = coordChannels?.position;
          const velId = coordChannels?.velocity;
          const effortId = `actuator/${actuatorId}/effort`;
          const cmdId = `actuator/${actuatorId}/command`;

          const posSamples = posId ? traces.get(posId) : undefined;
          const velSamples = velId ? traces.get(velId) : undefined;
          const effortSamples = traces.get(effortId);
          const cmdSamples = traces.get(cmdId);

          const posChannel = posId ? channels.get(posId) : undefined;
          const velChannel = velId ? channels.get(velId) : undefined;

          const posVal = posSamples ? nearestSample(posSamples, simTime) : undefined;
          const velVal = velSamples ? nearestSample(velSamples, simTime) : undefined;
          const effortVal = effortSamples ? nearestSample(effortSamples, simTime) : undefined;
          const cmdVal = cmdSamples ? nearestSample(cmdSamples, simTime) : undefined;

          const hasAnyData =
            posVal !== undefined ||
            velVal !== undefined ||
            effortVal !== undefined ||
            cmdVal !== undefined;

          return (
            <InspectorSection title="Simulation Values" icon={<Activity className="size-3.5" />}>
              {posVal !== undefined && (
                <PropertyRow label="Actual Position" unit={posChannel?.unit ?? ''} numeric>
                  <span className="font-[family-name:var(--font-mono)] tabular-nums">
                    {formatEngValue(posVal.value)}
                  </span>
                </PropertyRow>
              )}
              {velVal !== undefined && (
                <PropertyRow label="Actual Velocity" unit={velChannel?.unit ?? ''} numeric>
                  <span className="font-[family-name:var(--font-mono)] tabular-nums">
                    {formatEngValue(velVal.value)}
                  </span>
                </PropertyRow>
              )}
              {cmdVal !== undefined && (
                <PropertyRow label="Commanded" unit={commandUnit} numeric>
                  <span className="font-[family-name:var(--font-mono)] tabular-nums">
                    {formatEngValue(cmdVal.value)}
                  </span>
                </PropertyRow>
              )}
              {effortVal !== undefined && (
                <PropertyRow label="Applied Effort" unit={effortUnit} numeric>
                  <span className="font-[family-name:var(--font-mono)] tabular-nums">
                    {formatEngValue(effortVal.value)}
                  </span>
                </PropertyRow>
              )}
              {!hasAnyData && (
                <PropertyRow label="Status">
                  <span className="text-2xs text-text-tertiary">Awaiting data...</span>
                </PropertyRow>
              )}
            </InspectorSection>
          );
        })()}
    </InspectorPanel>
  );
}
