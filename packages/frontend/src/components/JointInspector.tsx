import { DOF_TABLE } from '@motionlab/viewport';
import {
  Button,
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
import { useSelectionStore } from '../stores/selection.js';
import { useSimulationStore } from '../stores/simulation.js';
import { useTraceStore } from '../stores/traces.js';
import { useToastStore } from '../stores/toast.js';
import { useToolModeStore } from '../stores/tool-mode.js';
import { composeWorldPose } from '../utils/pose-composition.js';
import { getJointCoordinateChannelIds } from '../utils/runtime-channel-ids.js';

import { CreateActuatorDialog } from './CreateActuatorDialog.js';
import { JointConnectionDiagram } from './JointConnectionDiagram.js';
import { IdentitySection, SimulationValuesSection } from './inspector/sections/index.js';

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
  const channels = useTraceStore((s) => s.channels);
  const isSimulating = simState === 'running' || simState === 'paused';

  const actuator = useMechanismStore((s) => {
    for (const a of s.actuators.values()) {
      if (a.jointId === jointId) return a;
    }
    return undefined;
  });

  const [frameMode, setFrameMode] = useState<'local' | 'world'>('local');
  const [createActuatorOpen, setCreateActuatorOpen] = useState(false);

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

  const handleEditAnchor = useCallback(
    (datumId: string) => {
      if (isSimulating) return;
      useSelectionStore.getState().select(datumId);
      useToolModeStore.getState().setGizmoMode('translate');
    },
    [isSimulating],
  );

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

  // Build channel definitions for SimulationValuesSection
  const coordChannels = getJointCoordinateChannelIds(jointId, joint.type);
  const channelDefs = [
    ...(coordChannels?.position
      ? [{
          channelId: coordChannels.position,
          label: 'Position',
          unit: channels.get(coordChannels.position)?.unit ?? '',
          type: 'scalar' as const,
        }]
      : []),
    ...(coordChannels?.velocity
      ? [{
          channelId: coordChannels.velocity,
          label: 'Velocity',
          unit: channels.get(coordChannels.velocity)?.unit ?? '',
          type: 'scalar' as const,
        }]
      : []),
    {
      channelId: `joint/${jointId}/reaction_force`,
      label: 'Reaction Force',
      unit: 'N',
      type: 'vec3' as const,
    },
    {
      channelId: `joint/${jointId}/reaction_torque`,
      label: 'Reaction Torque',
      unit: 'N\u00B7m',
      type: 'vec3' as const,
    },
  ];

  return (
    <InspectorPanel
      entityName={joint.name}
      entityType="Joint"
      entityIcon={<Link2 className="size-5" />}
    >
      <IdentitySection
        entityId={jointId}
        entityType="joint"
        name={joint.name}
        onRename={(newName) => sendUpdateJoint(jointId, { name: newName })}
        metadata={[
          {
            label: 'Type',
            value: (
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
                  <SelectItem value="universal">Universal</SelectItem>
                  <SelectItem value="distance">Distance</SelectItem>
                  <SelectItem value="point-line">Point-Line</SelectItem>
                  <SelectItem value="point-plane">Point-Plane</SelectItem>
                </SelectContent>
              </Select>
            ),
          },
          ...(DOF_TABLE[joint.type]
            ? [{
                label: 'DOF',
                value: (
                  <span className="text-2xs">
                    {DOF_TABLE[joint.type].label} ({DOF_TABLE[joint.type].total} of 6 free)
                  </span>
                ),
              }]
            : []),
        ]}
        disabled={isSimulating}
      />

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
        {joint && (
          <div className="flex gap-1 px-1.5 pt-0.5 pb-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={isSimulating}
              onClick={() => handleEditAnchor(joint.parentDatumId)}
              className="flex-1 text-[10px]"
            >
              Move Anchor A
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={isSimulating}
              onClick={() => handleEditAnchor(joint.childDatumId)}
              className="flex-1 text-[10px]"
            >
              Move Anchor B
            </Button>
          </div>
        )}
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

      {(joint.type === 'revolute' || joint.type === 'prismatic' || joint.type === 'cylindrical') && (
        <InspectorSection title="Dynamics" defaultOpen={false}>
          {joint.type === 'cylindrical' ? (
            <>
              <PropertyRow label="Trans. Damping" numeric>
                <NumericInput
                  value={joint.translationalDamping}
                  onChange={(v) => sendUpdateJoint(jointId, { translationalDamping: v })}
                  step={0.1}
                  precision={4}
                  min={0}
                  disabled={isSimulating}
                />
              </PropertyRow>
              <PropertyRow label="Rot. Damping" numeric>
                <NumericInput
                  value={joint.rotationalDamping}
                  onChange={(v) => sendUpdateJoint(jointId, { rotationalDamping: v })}
                  step={0.1}
                  precision={4}
                  min={0}
                  disabled={isSimulating}
                />
              </PropertyRow>
            </>
          ) : (
            <PropertyRow label="Damping" numeric>
              <NumericInput
                value={joint.damping}
                onChange={(v) => sendUpdateJoint(jointId, { damping: v })}
                step={0.1}
                precision={4}
                min={0}
                disabled={isSimulating}
              />
            </PropertyRow>
          )}
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

      <SimulationValuesSection channelDefinitions={channelDefs} />

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
