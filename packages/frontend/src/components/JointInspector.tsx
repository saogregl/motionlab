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
} from '@motionlab/ui';
import { Link2 } from 'lucide-react';
import { useCallback, useState } from 'react';

import { sendUpdateJoint } from '../engine/connection.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSimulationStore } from '../stores/simulation.js';
import { useTraceStore, type StoreSample } from '../stores/traces.js';

type JointType = 'revolute' | 'prismatic' | 'fixed';

/** Binary search for nearest sample to target time */
function nearestSample(samples: StoreSample[], time: number): StoreSample | undefined {
  if (samples.length === 0) return undefined;
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (samples[mid].time < time) lo = mid + 1;
    else hi = mid;
  }
  // Check adjacent sample for closer match
  if (lo > 0 && Math.abs(samples[lo - 1].time - time) < Math.abs(samples[lo].time - time)) {
    return samples[lo - 1];
  }
  return samples[lo];
}

export function JointInspector({ jointId }: { jointId: string }) {
  const joint = useMechanismStore((s) => s.joints.get(jointId));
  const parentDatum = useMechanismStore(
    (s) => (joint ? s.datums.get(joint.parentDatumId) : undefined),
  );
  const childDatum = useMechanismStore(
    (s) => (joint ? s.datums.get(joint.childDatumId) : undefined),
  );

  const simState = useSimulationStore((s) => s.state);
  const simTime = useSimulationStore((s) => s.simTime);
  const traces = useTraceStore((s) => s.traces);
  const channels = useTraceStore((s) => s.channels);
  const isSimulating = simState === 'running' || simState === 'paused';

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');

  const startEditName = useCallback(() => {
    if (!joint || isSimulating) return;
    setNameValue(joint.name);
    setEditingName(true);
  }, [joint, isSimulating]);

  const commitName = useCallback(() => {
    const trimmed = nameValue.trim();
    if (trimmed && joint && trimmed !== joint.name) {
      sendUpdateJoint(jointId, { name: trimmed });
    }
    setEditingName(false);
  }, [nameValue, joint, jointId]);

  if (!joint) return <InspectorPanel />;

  return (
    <InspectorPanel
      entityName={joint.name}
      entityType="Joint"
      entityIcon={<Link2 className="size-5" />}
    >
      <InspectorSection title="Identity">
        <PropertyRow label="Name">
          {editingName ? (
            <input
              autoFocus
              className="h-5 w-full rounded-[var(--radius-sm)] border border-[var(--accent-primary)] bg-[var(--layer-base)] px-1 text-2xs text-[var(--text-primary)] outline-none"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitName();
                if (e.key === 'Escape') setEditingName(false);
              }}
              onBlur={commitName}
            />
          ) : (
            <span
              className="text-2xs truncate cursor-pointer hover:text-[var(--accent-primary)]"
              onDoubleClick={startEditName}
            >
              {joint.name}
            </span>
          )}
        </PropertyRow>
        <PropertyRow label="Type">
          <Select
            value={joint.type}
            onValueChange={(v) => sendUpdateJoint(jointId, { type: v as JointType })}
          >
            <SelectTrigger className="h-5 text-2xs" disabled={isSimulating}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="revolute">Revolute</SelectItem>
              <SelectItem value="prismatic">Prismatic</SelectItem>
              <SelectItem value="fixed">Fixed</SelectItem>
            </SelectContent>
          </Select>
        </PropertyRow>
        <PropertyRow label="Joint ID">
          <span className="text-2xs truncate font-mono">
            {jointId.slice(0, 12)}...
          </span>
        </PropertyRow>
      </InspectorSection>

      <InspectorSection title="Connection">
        <PropertyRow label="Parent Datum">
          <span className="text-2xs truncate">
            {parentDatum?.name ?? '\u2014'}
          </span>
        </PropertyRow>
        <PropertyRow label="Child Datum">
          <span className="text-2xs truncate">
            {childDatum?.name ?? '\u2014'}
          </span>
        </PropertyRow>
      </InspectorSection>

      {joint.type !== 'fixed' && (
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

      {isSimulating && (() => {
        const posId = `joint/${jointId}/position`;
        const velId = `joint/${jointId}/velocity`;
        const posSamples = traces.get(posId);
        const velSamples = traces.get(velId);
        const posChannel = channels.get(posId);
        const velChannel = channels.get(velId);
        const posVal = posSamples ? nearestSample(posSamples, simTime) : undefined;
        const velVal = velSamples ? nearestSample(velSamples, simTime) : undefined;

        return (
          <InspectorSection title="Simulation Values">
            {posVal !== undefined && (
              <PropertyRow label="Position" unit={posChannel?.unit ?? ''} numeric>
                <span>{posVal.value.toFixed(4)}</span>
              </PropertyRow>
            )}
            {velVal !== undefined && (
              <PropertyRow label="Velocity" unit={velChannel?.unit ?? ''} numeric>
                <span>{velVal.value.toFixed(4)}</span>
              </PropertyRow>
            )}
            {posVal === undefined && velVal === undefined && (
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
