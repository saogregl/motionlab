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

type JointType = 'revolute' | 'prismatic' | 'fixed';

export function JointInspector({ jointId }: { jointId: string }) {
  const joint = useMechanismStore((s) => s.joints.get(jointId));
  const parentDatum = useMechanismStore(
    (s) => (joint ? s.datums.get(joint.parentDatumId) : undefined),
  );
  const childDatum = useMechanismStore(
    (s) => (joint ? s.datums.get(joint.childDatumId) : undefined),
  );

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');

  const startEditName = useCallback(() => {
    if (!joint) return;
    setNameValue(joint.name);
    setEditingName(true);
  }, [joint]);

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
            <SelectTrigger className="h-5 text-2xs">
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
            />
          </PropertyRow>
          <PropertyRow label="Upper" numeric>
            <NumericInput
              value={joint.upperLimit}
              onChange={(v) => sendUpdateJoint(jointId, { upperLimit: v })}
              step={joint.type === 'revolute' ? 0.1 : 0.01}
              precision={4}
            />
          </PropertyRow>
        </InspectorSection>
      )}
    </InspectorPanel>
  );
}
