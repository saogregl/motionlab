import { PropertyRow } from '@motionlab/ui';
import { useCallback } from 'react';

import { useSelectionStore } from '../stores/selection.js';

import type { JointTypeId } from '../stores/mechanism.js';

const JOINT_TYPE_LABELS: Record<JointTypeId, string> = {
  revolute: 'Rev',
  prismatic: 'Prism',
  fixed: 'Fixed',
  spherical: 'Spher',
  cylindrical: 'Cyl',
  planar: 'Planar',
  universal: 'Univ',
  distance: 'Dist',
  'point-line': 'PtLine',
  'point-plane': 'PtPlane',
};

interface JointConnectionDiagramProps {
  parentBodyName: string;
  parentBodyId: string;
  parentDatumName: string;
  parentDatumId: string;
  jointType: JointTypeId;
  childDatumName: string;
  childDatumId: string;
  childBodyName: string;
  childBodyId: string;
}

export function JointConnectionDiagram({
  parentBodyName,
  parentBodyId,
  parentDatumName,
  parentDatumId,
  jointType,
  childDatumName,
  childDatumId,
  childBodyName,
  childBodyId,
}: JointConnectionDiagramProps) {
  const select = useSelectionStore((s) => s.select);
  const setHovered = useSelectionStore((s) => s.setHovered);

  const handleHover = useCallback(
    (id: string | null) => setHovered(id),
    [setHovered],
  );

  return (
    <>
      <PropertyRow label="Type">
        <span className="text-2xs font-medium">
          {JOINT_TYPE_LABELS[jointType] ?? jointType}
        </span>
      </PropertyRow>

      <div className="px-1.5 pt-1.5">
        <span className="text-3xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
          Parent
        </span>
      </div>
      <PropertyRow label="Body">
        <InteractiveLabel
          label={parentBodyName}
          entityId={parentBodyId}
          onSelect={select}
          onHover={handleHover}
        />
      </PropertyRow>
      <PropertyRow label="Datum">
        <InteractiveLabel
          label={parentDatumName}
          entityId={parentDatumId}
          onSelect={select}
          onHover={handleHover}
        />
      </PropertyRow>

      <div className="px-1.5 pt-1.5">
        <span className="text-3xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
          Child
        </span>
      </div>
      <PropertyRow label="Body">
        <InteractiveLabel
          label={childBodyName}
          entityId={childBodyId}
          onSelect={select}
          onHover={handleHover}
        />
      </PropertyRow>
      <PropertyRow label="Datum">
        <InteractiveLabel
          label={childDatumName}
          entityId={childDatumId}
          onSelect={select}
          onHover={handleHover}
        />
      </PropertyRow>
    </>
  );
}

function InteractiveLabel({
  label,
  entityId,
  onSelect,
  onHover,
}: {
  label: string;
  entityId: string;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  return (
    <button
      type="button"
      className="truncate cursor-pointer text-2xs hover:underline"
      onClick={() => onSelect(entityId)}
      onMouseEnter={() => onHover(entityId)}
      onMouseLeave={() => onHover(null)}
      title={label}
    >
      {label}
    </button>
  );
}
