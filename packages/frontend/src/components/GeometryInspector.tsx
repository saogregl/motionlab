import {
  formatEngValue,
  InertiaMatrixDisplay,
  InspectorPanel,
  InspectorSection,
  PropertyRow,
  Vec3Display,
} from '@motionlab/ui';
import { Grid3X3, Hexagon, Scale } from 'lucide-react';

import {
  sendUpdateCollisionConfig,
  sendUpdateGeometryPose,
  sendUpdatePrimitive,
} from '../engine/connection.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSelectionStore } from '../stores/selection.js';
import { useSimulationStore } from '../stores/simulation.js';
import {
  CollisionSection,
  IdentitySection,
  PrimitiveParamsSection,
  TransformSection,
} from './inspector/sections/index.js';

export function GeometryInspector() {
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const geometries = useMechanismStore((s) => s.geometries);
  const bodies = useMechanismStore((s) => s.bodies);
  const simState = useSimulationStore((s) => s.state);
  const isSimulating = simState === 'running' || simState === 'paused';

  const firstId = selectedIds.values().next().value as string | undefined;
  const geometry = firstId ? geometries.get(firstId) : undefined;

  if (!geometry) return <InspectorPanel />;

  const parentBody = geometry.parentBodyId ? bodies.get(geometry.parentBodyId) : undefined;
  const mp = geometry.computedMassProperties;

  return (
    <InspectorPanel
      entityName={geometry.name}
      entityType="Geometry"
      entityIcon={<Hexagon className="size-5" />}
    >
      <TransformSection
        frameLabel={`(relative to ${parentBody?.name ?? 'body'})`}
        position={geometry.localPose.position}
        rotation={geometry.localPose.rotation}
        disabled={isSimulating}
        onTransformChange={(pose) => sendUpdateGeometryPose(geometry.id, pose)}
      />

      <IdentitySection
        entityId={geometry.id}
        entityType="geometry"
        name={geometry.name}
        metadata={[
          {
            label: 'Source',
            value: (
              <span className="text-2xs truncate">
                {geometry.primitiveSource
                  ? `Primitive (${geometry.primitiveSource.shape})`
                  : geometry.sourceAssetRef.originalFilename || '\u2014'}
              </span>
            ),
          },
          {
            label: 'Parent Body',
            value: <span className="text-2xs truncate">{parentBody?.name || 'Unparented'}</span>,
          },
        ]}
      />

      {geometry.primitiveSource && (
        <PrimitiveParamsSection
          geometryId={geometry.id}
          shape={geometry.primitiveSource.shape}
          params={geometry.primitiveSource.params}
          isSimulating={isSimulating}
          onParamsChange={(params) => {
            sendUpdatePrimitive(geometry.id, params);
          }}
        />
      )}

      <CollisionSection
        geometryId={geometry.id}
        collisionConfig={geometry.collisionConfig}
        isSimulating={isSimulating}
        onConfigChange={(config) => {
          sendUpdateCollisionConfig(geometry.id, config);
        }}
      />

      <InspectorSection
        title="Computed Mass"
        icon={<Scale className="size-3.5" />}
        defaultOpen={false}
      >
        <PropertyRow label="Mass" unit="kg" numeric>
          <span className="font-[family-name:var(--font-mono)] tabular-nums">
            {formatEngValue(mp.mass)}
          </span>
        </PropertyRow>
        <Vec3Display label="Center of Mass" value={mp.centerOfMass} unit="m" />
      </InspectorSection>

      <InspectorSection
        title="Computed Inertia"
        icon={<Grid3X3 className="size-3.5" />}
        defaultOpen={false}
      >
        <InertiaMatrixDisplay
          ixx={mp.ixx}
          iyy={mp.iyy}
          izz={mp.izz}
          ixy={mp.ixy}
          ixz={mp.ixz}
          iyz={mp.iyz}
          unit="kg m²"
        />
      </InspectorSection>
    </InspectorPanel>
  );
}
