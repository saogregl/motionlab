import { DOF_TABLE } from '@motionlab/viewport';
import {
  Button,
  CopyableId,
  InlineEditableName,
  InspectorPanel,
  InspectorSection,
  NumericInput,
  PropertyRow,
  QuatDisplay,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Vec3Display,
  formatEngValue,
} from '@motionlab/ui';
import { Link2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { sendDeleteActuator, sendUpdateJoint } from '../engine/connection.js';
import { useJointCreationStore } from '../stores/joint-creation.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSimulationStore } from '../stores/simulation.js';
import { useToastStore } from '../stores/toast.js';
import { useToolModeStore } from '../stores/tool-mode.js';
import { useTraceStore } from '../stores/traces.js';
import { nearestSample } from '../utils/nearest-sample.js';
import { composeWorldPose } from '../utils/pose-composition.js';
import { getJointCoordinateChannelIds } from '../utils/runtime-channel-ids.js';

import { CreateActuatorDialog } from './CreateActuatorDialog.js';
import { JointConnectionDiagram } from './JointConnectionDiagram.js';

import type { ActuatorTypeId, ControlModeId, JointTypeId } from '../stores/mechanism.js';

type JointType = JointTypeId;

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

export function JointInspector({ jointId }: { jointId: string }) {
  const joint = useMechanismStore((s) => s.joints.get(jointId));
  const parentDatum = useMechanismStore((s) =>
    joint ? s.datums.get(joint.parentDatumId) : undefined,
  );
  const childDatum = useMechanismStore((s) =>
    joint ? s.datums.get(joint.childDatumId) : undefined,
  );
  const parentBody = useMechanismStore((s) =>
    parentDatum ? s.bodies.get(parentDatum.parentBodyId) : undefined,
  );
  const childBody = useMechanismStore((s) =>
    childDatum ? s.bodies.get(childDatum.parentBodyId) : undefined,
  );

  const simState = useSimulationStore((s) => s.state);
  const simTime = useSimulationStore((s) => s.simTime);
  const traces = useTraceStore((s) => s.traces);
  const channels = useTraceStore((s) => s.channels);
  const isSimulating = simState === 'running' || simState === 'paused';

  const actuator = useMechanismStore((s) => {
    for (const a of s.actuators.values()) {
      if (a.jointId === jointId) return a;
    }
    return undefined;
  });

  const [editingName, setEditingName] = useState(false);
  const [frameMode, setFrameMode] = useState<'local' | 'world'>('local');
  const [createActuatorOpen, setCreateActuatorOpen] = useState(false);

  const startEditName = useCallback(() => {
    if (!joint || isSimulating) return;
    setEditingName(true);
  }, [joint, isSimulating]);

  const commitName = useCallback(
    (newName: string) => {
      if (joint && newName !== joint.name) {
        sendUpdateJoint(jointId, { name: newName });
      }
      setEditingName(false);
    },
    [joint, jointId],
  );

  const handleSwap = useCallback(() => {
    if (!joint || isSimulating) return;
    sendUpdateJoint(jointId, {
      parentDatumId: joint.childDatumId,
      childDatumId: joint.parentDatumId,
    });
    useToastStore.getState().addToast({
      variant: 'info',
      title: 'Parent/child swapped',
      description: 'Joint axis may have changed direction.',
    });
  }, [joint, jointId, isSimulating]);

  const handleEditJoint = useCallback(() => {
    if (!joint || isSimulating) return;
    useToolModeStore.getState().setMode('create-joint');
    useJointCreationStore
      .getState()
      .editExisting(jointId, joint.parentDatumId, joint.childDatumId, joint.type);
  }, [joint, jointId, isSimulating]);

  // Compute poses for coordinate frame display
  const parentDatumPose = useMemo(() => {
    if (!parentDatum || !parentBody) return null;
    if (frameMode === 'local') return parentDatum.localPose;
    return composeWorldPose(parentBody.pose, parentDatum.localPose);
  }, [parentDatum, parentBody, frameMode]);

  const childDatumPose = useMemo(() => {
    if (!childDatum || !childBody) return null;
    if (frameMode === 'local') return childDatum.localPose;
    return composeWorldPose(childBody.pose, childDatum.localPose);
  }, [childDatum, childBody, frameMode]);

  if (!joint) return <InspectorPanel />;

  return (
    <InspectorPanel
      entityName={joint.name}
      entityType="Joint"
      entityIcon={<Link2 className="size-5" />}
    >
      <InspectorSection title="Identity">
        <PropertyRow label="Name">
          <InlineEditableName
            value={joint.name}
            isEditing={editingName}
            onStartEdit={startEditName}
            onCommit={commitName}
            onCancel={() => setEditingName(false)}
          />
        </PropertyRow>
        <PropertyRow label="Type">
          <Select
            value={joint.type}
            onValueChange={(v) => sendUpdateJoint(jointId, { type: v as JointType })}
          >
            <SelectTrigger size="sm" disabled={isSimulating}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="revolute">Revolute</SelectItem>
              <SelectItem value="prismatic">Prismatic</SelectItem>
              <SelectItem value="fixed">Fixed</SelectItem>
              <SelectItem value="spherical">Spherical</SelectItem>
              <SelectItem value="cylindrical">Cylindrical</SelectItem>
              <SelectItem value="planar">Planar</SelectItem>
            </SelectContent>
          </Select>
        </PropertyRow>
        <PropertyRow label="Joint ID">
          <CopyableId value={jointId} />
        </PropertyRow>
        {DOF_TABLE[joint.type] && (
          <PropertyRow label="DOF">
            <span className="text-2xs">
              {DOF_TABLE[joint.type].label} ({DOF_TABLE[joint.type].total} of 6 free)
            </span>
          </PropertyRow>
        )}
      </InspectorSection>

      {/* Connection diagram + swap + edit */}
      <InspectorSection title="Connection">
        {parentDatum && childDatum && parentBody && childBody ? (
          <JointConnectionDiagram
            parentBodyName={parentBody.name}
            parentBodyId={parentBody.id}
            parentDatumName={parentDatum.name}
            parentDatumId={parentDatum.id}
            jointType={joint.type}
            childDatumName={childDatum.name}
            childDatumId={childDatum.id}
            childBodyName={childBody.name}
            childBodyId={childBody.id}
          />
        ) : (
          <>
            <PropertyRow label="Parent Datum">
              <span className="text-2xs truncate">{parentDatum?.name ?? '\u2014'}</span>
            </PropertyRow>
            <PropertyRow label="Child Datum">
              <span className="text-2xs truncate">{childDatum?.name ?? '\u2014'}</span>
            </PropertyRow>
          </>
        )}
        <div className="flex gap-1 px-1.5 pt-1">
          <Button
            variant="outline"
            size="sm"
            disabled={isSimulating}
            onClick={handleSwap}
            className="flex-1"
          >
            Swap
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isSimulating}
            onClick={handleEditJoint}
            className="flex-1"
          >
            Edit Joint
          </Button>
        </div>
      </InspectorSection>

      {/* Coordinate frame display */}
      <InspectorSection title="Coordinate Frames" defaultOpen={false}>
        <div className="flex gap-px px-1.5 pb-1">
          <button
            type="button"
            className={`flex-1 rounded-s border px-2 py-0.5 text-[10px] font-medium transition-colors ${
              frameMode === 'local'
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border-subtle bg-transparent text-text-tertiary hover:text-text-secondary'
            }`}
            onClick={() => setFrameMode('local')}
          >
            Local
          </button>
          <button
            type="button"
            className={`flex-1 rounded-e border border-s-0 px-2 py-0.5 text-[10px] font-medium transition-colors ${
              frameMode === 'world'
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border-subtle bg-transparent text-text-tertiary hover:text-text-secondary'
            }`}
            onClick={() => setFrameMode('world')}
          >
            World
          </button>
        </div>
        {parentDatumPose && (
          <>
            <div className="px-1.5 pt-1">
              <span className="text-3xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                Parent Datum
              </span>
            </div>
            <Vec3Display label="Position" value={parentDatumPose.position} unit="m" />
            <QuatDisplay value={parentDatumPose.rotation} label="Orientation" />
          </>
        )}
        {childDatumPose && (
          <>
            <div className="px-1.5 pt-1">
              <span className="text-3xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                Child Datum
              </span>
            </div>
            <Vec3Display label="Position" value={childDatumPose.position} unit="m" />
            <QuatDisplay value={childDatumPose.rotation} label="Orientation" />
          </>
        )}
      </InspectorSection>

      {(joint.type === 'revolute' || joint.type === 'prismatic' || joint.type === 'cylindrical') && (
        <InspectorSection title="Limits">
          <PropertyRow label="Lower" numeric>
            <NumericInput
              value={joint.lowerLimit}
              onChange={(v) => sendUpdateJoint(jointId, { lowerLimit: v })}
              step={joint.type === 'revolute' ? 0.1 : 0.01}
              precision={4}
              disabled={isSimulating}
            />
          </PropertyRow>
          <PropertyRow label="Upper" numeric>
            <NumericInput
              value={joint.upperLimit}
              onChange={(v) => sendUpdateJoint(jointId, { upperLimit: v })}
              step={joint.type === 'revolute' ? 0.1 : 0.01}
              precision={4}
              disabled={isSimulating}
            />
          </PropertyRow>
        </InspectorSection>
      )}

      {(joint.type === 'revolute' || joint.type === 'prismatic') && (
        <InspectorSection title="Actuation">
          {actuator ? (
            <>
              <PropertyRow label="Type">
                <span className="text-2xs">
                  {actuator.type === 'revolute-motor' ? 'Revolute Motor' : 'Prismatic Motor'}
                </span>
              </PropertyRow>
              <PropertyRow label="Control Mode">
                <span className="text-2xs capitalize">{actuator.controlMode}</span>
              </PropertyRow>
              <PropertyRow
                label="Command"
                unit={getActuatorUnit(actuator.type, actuator.controlMode)}
                numeric
              >
                <span className="font-[family-name:var(--font-mono)] tabular-nums">
                  {formatEngValue(actuator.commandValue)}
                </span>
              </PropertyRow>
              {actuator.effortLimit !== undefined && (
                <PropertyRow
                  label="Effort Limit"
                  unit={actuator.type === 'revolute-motor' ? 'Nm' : 'N'}
                  numeric
                >
                  <span className="font-[family-name:var(--font-mono)] tabular-nums">
                    {formatEngValue(actuator.effortLimit)}
                  </span>
                </PropertyRow>
              )}
              {!isSimulating && (
                <div className="flex gap-1 px-1.5 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => setCreateActuatorOpen(true)}
                  >
                    Edit Motor
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => sendDeleteActuator(actuator.id)}
                  >
                    Remove
                  </Button>
                </div>
              )}
            </>
          ) : (
            !isSimulating && (
              <div className="px-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setCreateActuatorOpen(true)}
                >
                  Add Motor
                </Button>
              </div>
            )
          )}
        </InspectorSection>
      )}

      {isSimulating &&
        (() => {
          const coordChannels = getJointCoordinateChannelIds(jointId, joint.type);
          const posId = coordChannels?.position;
          const velId = coordChannels?.velocity;
          const forceId = `joint/${jointId}/reaction_force`;
          const torqueId = `joint/${jointId}/reaction_torque`;
          const posSamples = posId ? traces.get(posId) : undefined;
          const velSamples = velId ? traces.get(velId) : undefined;
          const forceSamples = traces.get(forceId);
          const torqueSamples = traces.get(torqueId);
          const posChannel = posId ? channels.get(posId) : undefined;
          const velChannel = velId ? channels.get(velId) : undefined;
          const posVal = posSamples ? nearestSample(posSamples, simTime) : undefined;
          const velVal = velSamples ? nearestSample(velSamples, simTime) : undefined;
          const forceVal = forceSamples ? nearestSample(forceSamples, simTime) : undefined;
          const torqueVal = torqueSamples ? nearestSample(torqueSamples, simTime) : undefined;

          const hasAnyData =
            posVal !== undefined ||
            velVal !== undefined ||
            forceVal !== undefined ||
            torqueVal !== undefined;
          const hasAnyTelemetry =
            (posId ? channels.has(posId) : false) ||
            (velId ? channels.has(velId) : false) ||
            channels.has(forceId) ||
            channels.has(torqueId);

          return (
            <InspectorSection title="Simulation Values">
              {posVal !== undefined && (
                <PropertyRow label="Position" unit={posChannel?.unit ?? ''} numeric>
                  <span className="font-[family-name:var(--font-mono)] tabular-nums">
                    {formatEngValue(posVal.value)}
                  </span>
                </PropertyRow>
              )}
              {velVal !== undefined && (
                <PropertyRow label="Velocity" unit={velChannel?.unit ?? ''} numeric>
                  <span className="font-[family-name:var(--font-mono)] tabular-nums">
                    {formatEngValue(velVal.value)}
                  </span>
                </PropertyRow>
              )}
              {forceVal?.vec ? (
                <Vec3Display label="Reaction Force" value={forceVal.vec} unit="N" />
              ) : channels.has(forceId) ? (
                <PropertyRow label="Reaction Force">
                  <span className="text-2xs text-text-tertiary">Awaiting data...</span>
                </PropertyRow>
              ) : (
                <PropertyRow label="Reaction Force">
                  <span className="text-2xs text-text-tertiary">Not available</span>
                </PropertyRow>
              )}
              {torqueVal?.vec ? (
                <Vec3Display label="Reaction Torque" value={torqueVal.vec} unit="N\u00B7m" />
              ) : channels.has(torqueId) ? (
                <PropertyRow label="Reaction Torque">
                  <span className="text-2xs text-text-tertiary">Awaiting data...</span>
                </PropertyRow>
              ) : (
                <PropertyRow label="Reaction Torque">
                  <span className="text-2xs text-text-tertiary">Not available</span>
                </PropertyRow>
              )}
              {!hasAnyData && (
                <PropertyRow label="Status">
                  <span className="text-2xs text-text-tertiary">
                    {hasAnyTelemetry ? 'Awaiting data...' : 'Not available'}
                  </span>
                </PropertyRow>
              )}
            </InspectorSection>
          );
        })()}
      <CreateActuatorDialog
        jointId={jointId}
        jointType={joint.type}
        open={createActuatorOpen}
        onClose={() => setCreateActuatorOpen(false)}
        initialActuator={createActuatorOpen ? actuator : undefined}
      />
    </InspectorPanel>
  );
}
