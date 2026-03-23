import {
  CopyableId,
  InertiaMatrixDisplay,
  InspectorPanel,
  InspectorSection,
  PropertyRow,
  QuatDisplay,
  Vec3Display,
  formatEngValue,
} from '@motionlab/ui';
import { Fingerprint, Grid3X3, Hexagon, Move3D, Scale } from 'lucide-react';

import { useMechanismStore } from '../stores/mechanism.js';
import { useSelectionStore } from '../stores/selection.js';

export function GeometryInspector() {
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const geometries = useMechanismStore((s) => s.geometries);
  const bodies = useMechanismStore((s) => s.bodies);

  const firstId = selectedIds.values().next().value as string | undefined;
  const geometry = firstId ? geometries.get(firstId) : undefined;

  if (!geometry) return <InspectorPanel />;

  const parentBody = geometry.parentBodyId
    ? bodies.get(geometry.parentBodyId)
    : undefined;
  const mp = geometry.computedMassProperties;

  return (
    <InspectorPanel
      entityName={geometry.name}
      entityType="Geometry"
      entityIcon={<Hexagon className="size-5" />}
    >
      <InspectorSection title="Identity" icon={<Fingerprint className="size-3.5" />}>
        <PropertyRow label="Name">
          <span className="text-2xs truncate">{geometry.name}</span>
        </PropertyRow>
        <PropertyRow label="Source File">
          <span className="text-2xs truncate">
            {geometry.sourceAssetRef.originalFilename || '\u2014'}
          </span>
        </PropertyRow>
        <PropertyRow label="Parent Body">
          <span className="text-2xs truncate">
            {parentBody?.name || 'Unparented'}
          </span>
        </PropertyRow>
        <PropertyRow label="Geometry ID">
          <CopyableId value={geometry.id} />
        </PropertyRow>
      </InspectorSection>

      <InspectorSection title="Computed Mass" icon={<Scale className="size-3.5" />}>
        <PropertyRow label="Mass" unit="kg" numeric>
          <span className="font-[family-name:var(--font-mono)] tabular-nums">
            {formatEngValue(mp.mass)}
          </span>
        </PropertyRow>
        <Vec3Display label="Center of Mass" value={mp.centerOfMass} unit="m" />
      </InspectorSection>

      <InspectorSection title="Computed Inertia" icon={<Grid3X3 className="size-3.5" />}>
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

      <InspectorSection title="Local Pose" icon={<Move3D className="size-3.5" />}>
        <Vec3Display label="Offset" value={geometry.localPose.position} unit="m" />
        <QuatDisplay value={geometry.localPose.rotation} label="Rotation" />
      </InspectorSection>
    </InspectorPanel>
  );
}
