import {
  CopyableId,
  InertiaMatrixDisplay,
  InspectorPanel,
  InspectorSection,
  PropertyRow,
  QuatDisplay,
  Switch,
  Vec3Display,
} from '@motionlab/ui';
import { Box } from 'lucide-react';
import { sendUpdateBody } from '../engine/connection.js';
import { getBodyPose } from '../stores/body-poses.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSelectionStore } from '../stores/selection.js';
import { useSimulationStore } from '../stores/simulation.js';

export function BodyInspector() {
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const bodies = useMechanismStore((s) => s.bodies);
  const simState = useSimulationStore((s) => s.state);
  // Subscribe to simTime as a refresh trigger for live pose readout
  useSimulationStore((s) => s.simTime);

  const firstId = selectedIds.values().next().value as string | undefined;
  const body = firstId ? bodies.get(firstId) : undefined;
  const isSimulating = simState === 'running' || simState === 'paused';
  const livePose = firstId && isSimulating ? getBodyPose(firstId) : undefined;

  if (!body) {
    return <InspectorPanel />;
  }

  const { massProperties: mp } = body;

  return (
    <InspectorPanel
      entityName={body.name}
      entityType="Body"
      entityIcon={<Box className="size-5" />}
    >
      <InspectorSection title="Identity">
        <PropertyRow label="Name">
          <span className="text-2xs truncate">{body.name}</span>
        </PropertyRow>
        <PropertyRow label="Source">
          <span className="text-2xs truncate">{body.sourceAssetRef.originalFilename || '—'}</span>
        </PropertyRow>
        <PropertyRow label="Body ID">
          <CopyableId value={body.id} />
        </PropertyRow>
        <PropertyRow label="Fixed (Ground)">
          <div className="flex items-center gap-1.5">
            <Switch
              size="sm"
              checked={body.isFixed ?? false}
              onCheckedChange={(checked) => sendUpdateBody(body.id, { isFixed: checked })}
              disabled={isSimulating}
            />
            <span className="text-2xs text-[var(--text-secondary)]">
              {body.isFixed ? 'Yes' : 'No'}
            </span>
          </div>
        </PropertyRow>
      </InspectorSection>

      <InspectorSection title="Mass Properties">
        <PropertyRow label="Mass" unit="kg" numeric>
          <span>{mp.mass.toFixed(6)}</span>
        </PropertyRow>
        <Vec3Display
          label="Center of Mass"
          value={mp.centerOfMass}
          unit="m"
          precision={6}
        />
      </InspectorSection>

      <InspectorSection title="Inertia Tensor">
        <InertiaMatrixDisplay
          ixx={mp.ixx}
          iyy={mp.iyy}
          izz={mp.izz}
          ixy={mp.ixy}
          ixz={mp.ixz}
          iyz={mp.iyz}
          precision={6}
          unit="kg m²"
        />
      </InspectorSection>

      {livePose && (
        <InspectorSection title="Current Pose">
          <Vec3Display
            label="Position"
            value={livePose.position}
            unit="m"
            precision={6}
          />
          <QuatDisplay
            value={livePose.rotation}
            label="Rotation"
            precision={6}
          />
        </InspectorSection>
      )}
    </InspectorPanel>
  );
}
