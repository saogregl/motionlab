import {
  CopyableId,
  InlineEditableName,
  InspectorPanel,
  InspectorSection,
  PropertyRow,
  QuatDisplay,
  Vec3Display,
} from '@motionlab/ui';
import { Crosshair, Fingerprint, Move3D, RotateCcw } from 'lucide-react';
import { useCallback, useState } from 'react';

import { sendRenameDatum } from '../engine/connection.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSimulationStore } from '../stores/simulation.js';

export function DatumInspector({ datumId }: { datumId: string }) {
  const datum = useMechanismStore((s) => s.datums.get(datumId));
  const parentBody = useMechanismStore((s) =>
    datum ? s.bodies.get(datum.parentBodyId) : undefined,
  );

  const simState = useSimulationStore((s) => s.state);
  const isSimulating = simState === 'running' || simState === 'paused';

  const [editingName, setEditingName] = useState(false);

  const startEditName = useCallback(() => {
    if (!datum || isSimulating) return;
    setEditingName(true);
  }, [datum, isSimulating]);

  const commitName = useCallback(
    (newName: string) => {
      if (datum && newName !== datum.name) {
        sendRenameDatum(datumId, newName);
      }
      setEditingName(false);
    },
    [datum, datumId],
  );

  if (!datum) return <InspectorPanel />;

  const { localPose } = datum;

  return (
    <InspectorPanel
      entityName={datum.name}
      entityType="Datum"
      entityIcon={<Crosshair className="size-5" />}
    >
      <InspectorSection title="Identity" icon={<Fingerprint className="size-3.5" />}>
        <PropertyRow label="Name">
          <InlineEditableName
            value={datum.name}
            isEditing={editingName}
            onStartEdit={startEditName}
            onCommit={commitName}
            onCancel={() => setEditingName(false)}
          />
        </PropertyRow>
        <PropertyRow label="Parent Body">
          <span className="text-2xs truncate">{parentBody?.name ?? '\u2014'}</span>
        </PropertyRow>
        <PropertyRow label="Datum ID">
          <CopyableId value={datumId} />
        </PropertyRow>
      </InspectorSection>

      <InspectorSection title="Local Pose" icon={<Move3D className="size-3.5" />}>
        <Vec3Display
          label="Position"
          value={localPose.position}
          unit="m"
        />
      </InspectorSection>

      <InspectorSection title="Orientation" icon={<RotateCcw className="size-3.5" />}>
        <QuatDisplay value={localPose.rotation} />
      </InspectorSection>
    </InspectorPanel>
  );
}
