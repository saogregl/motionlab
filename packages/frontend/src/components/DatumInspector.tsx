import { InspectorPanel } from '@motionlab/ui';
import { Crosshair } from 'lucide-react';

import { sendRenameDatum } from '../engine/connection.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSimulationStore } from '../stores/simulation.js';
import { IdentitySection, PoseSection } from './inspector/sections/index.js';

export function DatumInspector({ datumId }: { datumId: string }) {
  const datum = useMechanismStore((s) => s.datums.get(datumId));
  const parentBody = useMechanismStore((s) =>
    datum ? s.bodies.get(datum.parentBodyId) : undefined,
  );

  const simState = useSimulationStore((s) => s.state);
  const isSimulating = simState === 'running' || simState === 'paused';

  if (!datum) return <InspectorPanel />;

  const { localPose } = datum;

  return (
    <InspectorPanel
      entityName={datum.name}
      entityType="Datum"
      entityIcon={<Crosshair className="size-5" />}
    >
      <IdentitySection
        entityId={datumId}
        entityType="datum"
        name={datum.name}
        onRename={(newName) => sendRenameDatum(datumId, newName)}
        metadata={[
          {
            label: 'Parent Body',
            value: (
              <span className="text-2xs truncate">{parentBody?.name ?? '\u2014'}</span>
            ),
          },
        ]}
        disabled={isSimulating}
      />

      <PoseSection
        title="Local Pose"
        position={localPose.position}
        rotation={localPose.rotation}
      />
    </InspectorPanel>
  );
}
