import { InspectorPanel, InspectorSection, PropertyRow } from '@motionlab/ui';
import { Box } from 'lucide-react';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSelectionStore } from '../stores/selection.js';

function fmt(value: number): string {
  return value.toFixed(6);
}

export function BodyInspector() {
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const bodies = useMechanismStore((s) => s.bodies);

  const firstId = selectedIds.values().next().value as string | undefined;
  const body = firstId ? bodies.get(firstId) : undefined;

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
          <span className="text-2xs truncate">
            {body.sourceAssetRef.originalFilename || '—'}
          </span>
        </PropertyRow>
        <PropertyRow label="Body ID">
          <span className="text-2xs truncate font-mono">{body.id.slice(0, 12)}…</span>
        </PropertyRow>
      </InspectorSection>

      <InspectorSection title="Mass Properties">
        <PropertyRow label="Mass" unit="kg" numeric>
          <span>{fmt(mp.mass)}</span>
        </PropertyRow>
        <PropertyRow label="CoM X" unit="m" numeric>
          <span>{fmt(mp.centerOfMass.x)}</span>
        </PropertyRow>
        <PropertyRow label="CoM Y" unit="m" numeric>
          <span>{fmt(mp.centerOfMass.y)}</span>
        </PropertyRow>
        <PropertyRow label="CoM Z" unit="m" numeric>
          <span>{fmt(mp.centerOfMass.z)}</span>
        </PropertyRow>
      </InspectorSection>

      <InspectorSection title="Inertia Tensor">
        <PropertyRow label="Ixx" unit="kg·m²" numeric>
          <span>{fmt(mp.ixx)}</span>
        </PropertyRow>
        <PropertyRow label="Iyy" unit="kg·m²" numeric>
          <span>{fmt(mp.iyy)}</span>
        </PropertyRow>
        <PropertyRow label="Izz" unit="kg·m²" numeric>
          <span>{fmt(mp.izz)}</span>
        </PropertyRow>
        <PropertyRow label="Ixy" unit="kg·m²" numeric>
          <span>{fmt(mp.ixy)}</span>
        </PropertyRow>
        <PropertyRow label="Ixz" unit="kg·m²" numeric>
          <span>{fmt(mp.ixz)}</span>
        </PropertyRow>
        <PropertyRow label="Iyz" unit="kg·m²" numeric>
          <span>{fmt(mp.iyz)}</span>
        </PropertyRow>
      </InspectorSection>
    </InspectorPanel>
  );
}
