import { InspectorPanel, InspectorSection, PropertyRow } from '@motionlab/ui';
import { Crosshair } from 'lucide-react';
import { useCallback, useState } from 'react';

import { sendRenameDatum } from '../engine/connection.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSimulationStore } from '../stores/simulation.js';

function fmt(value: number): string {
  return value.toFixed(6);
}

export function DatumInspector({ datumId }: { datumId: string }) {
  const datum = useMechanismStore((s) => s.datums.get(datumId));
  const parentBody = useMechanismStore(
    (s) => (datum ? s.bodies.get(datum.parentBodyId) : undefined),
  );

  const simState = useSimulationStore((s) => s.state);
  const isSimulating = simState === 'running' || simState === 'paused';

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');

  const startEditName = useCallback(() => {
    if (!datum || isSimulating) return;
    setNameValue(datum.name);
    setEditingName(true);
  }, [datum, isSimulating]);

  const commitName = useCallback(() => {
    const trimmed = nameValue.trim();
    if (trimmed && datum && trimmed !== datum.name) {
      sendRenameDatum(datumId, trimmed);
    }
    setEditingName(false);
  }, [nameValue, datum, datumId]);

  if (!datum) return <InspectorPanel />;

  const { localPose } = datum;

  return (
    <InspectorPanel
      entityName={datum.name}
      entityType="Datum"
      entityIcon={<Crosshair className="size-5" />}
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
              {datum.name}
            </span>
          )}
        </PropertyRow>
        <PropertyRow label="Parent Body">
          <span className="text-2xs truncate">{parentBody?.name ?? '—'}</span>
        </PropertyRow>
        <PropertyRow label="Datum ID">
          <span className="text-2xs truncate font-mono">
            {datumId.slice(0, 12)}…
          </span>
        </PropertyRow>
      </InspectorSection>

      <InspectorSection title="Local Pose">
        <PropertyRow label="Pos X" unit="m" numeric>
          <span>{fmt(localPose.position.x)}</span>
        </PropertyRow>
        <PropertyRow label="Pos Y" unit="m" numeric>
          <span>{fmt(localPose.position.y)}</span>
        </PropertyRow>
        <PropertyRow label="Pos Z" unit="m" numeric>
          <span>{fmt(localPose.position.z)}</span>
        </PropertyRow>
      </InspectorSection>

      <InspectorSection title="Orientation (Quaternion)">
        <PropertyRow label="X" numeric>
          <span>{fmt(localPose.rotation.x)}</span>
        </PropertyRow>
        <PropertyRow label="Y" numeric>
          <span>{fmt(localPose.rotation.y)}</span>
        </PropertyRow>
        <PropertyRow label="Z" numeric>
          <span>{fmt(localPose.rotation.z)}</span>
        </PropertyRow>
        <PropertyRow label="W" numeric>
          <span>{fmt(localPose.rotation.w)}</span>
        </PropertyRow>
      </InspectorSection>
    </InspectorPanel>
  );
}
