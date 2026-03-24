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
    <div className="flex items-center gap-0.5 px-1.5 py-1 text-2xs overflow-hidden">
      {/* Parent body */}
      <InteractiveLabel
        label={parentBodyName}
        entityId={parentBodyId}
        className="text-green-400"
        onSelect={select}
        onHover={handleHover}
      />
      <Connector />
      {/* Parent datum */}
      <InteractiveLabel
        label={parentDatumName}
        entityId={parentDatumId}
        className="text-green-300"
        onSelect={select}
        onHover={handleHover}
      />
      <Connector />
      {/* Joint type badge */}
      <span className="shrink-0 rounded border border-border-subtle bg-surface-elevated px-1 py-0.5 text-[10px] font-semibold text-text-secondary">
        {JOINT_TYPE_LABELS[jointType] ?? jointType}
      </span>
      <Connector />
      {/* Child datum */}
      <InteractiveLabel
        label={childDatumName}
        entityId={childDatumId}
        className="text-orange-300"
        onSelect={select}
        onHover={handleHover}
      />
      <Connector />
      {/* Child body */}
      <InteractiveLabel
        label={childBodyName}
        entityId={childBodyId}
        className="text-orange-400"
        onSelect={select}
        onHover={handleHover}
      />
    </div>
  );
}

function Connector() {
  return <span className="shrink-0 text-text-tertiary">&mdash;</span>;
}

function InteractiveLabel({
  label,
  entityId,
  className,
  onSelect,
  onHover,
}: {
  label: string;
  entityId: string;
  className?: string;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  return (
    <button
      type="button"
      className={`truncate cursor-pointer hover:underline ${className ?? ''}`}
      onClick={() => onSelect(entityId)}
      onMouseEnter={() => onHover(entityId)}
      onMouseLeave={() => onHover(null)}
      title={label}
    >
      {label}
    </button>
  );
}
