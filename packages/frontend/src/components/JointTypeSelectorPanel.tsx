import {
  Badge,
  Button,
  FloatingToolCard,
  Input,
  NumericInput,
  PropertyRow,
} from '@motionlab/ui';
import {
  ArrowLeftRight,
  Circle,
  Cylinder,
  Link2,
  Lock,
  Move,
  RotateCw,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { sendCreateJoint } from '../engine/connection.js';
import { useJointCreationStore } from '../stores/joint-creation.js';
import type { JointTypeId } from '../stores/mechanism.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { nextJointName } from '../utils/joint-naming.js';

interface JointTypeOption {
  type: JointTypeId;
  label: string;
  dof: string;
  icon: React.ReactNode;
  hasLimits: boolean;
}

const JOINT_TYPE_OPTIONS: JointTypeOption[] = [
  { type: 'revolute', label: 'Revolute', dof: '1R', icon: <RotateCw className="size-3.5" />, hasLimits: true },
  { type: 'prismatic', label: 'Prismatic', dof: '1T', icon: <ArrowLeftRight className="size-3.5" />, hasLimits: true },
  { type: 'fixed', label: 'Fixed', dof: '0', icon: <Lock className="size-3.5" />, hasLimits: false },
  { type: 'spherical', label: 'Spherical', dof: '3R', icon: <Circle className="size-3.5" />, hasLimits: false },
  { type: 'cylindrical', label: 'Cylindrical', dof: '1R+1T', icon: <Cylinder className="size-3.5" />, hasLimits: true },
  { type: 'planar', label: 'Planar', dof: '1R+2T', icon: <Move className="size-3.5" />, hasLimits: false },
];

export function JointTypeSelectorPanel() {
  const step = useJointCreationStore((s) => s.step);
  const parentDatumId = useJointCreationStore((s) => s.parentDatumId);
  const childDatumId = useJointCreationStore((s) => s.childDatumId);
  const recommendedTypes = useJointCreationStore((s) => s.recommendedTypes);
  const selectedJointType = useJointCreationStore((s) => s.selectedJointType);
  const selectJointType = useJointCreationStore((s) => s.selectJointType);
  const setPreviewJointType = useJointCreationStore((s) => s.setPreviewJointType);
  const cancel = useJointCreationStore((s) => s.cancel);
  const reset = useJointCreationStore((s) => s.reset);

  const parentDatum = useMechanismStore((s) =>
    parentDatumId ? s.datums.get(parentDatumId) : undefined,
  );
  const childDatum = useMechanismStore((s) =>
    childDatumId ? s.datums.get(childDatumId) : undefined,
  );

  const [name, setName] = useState('');
  const [lowerLimit, setLowerLimit] = useState(0);
  const [upperLimit, setUpperLimit] = useState(0);

  // Auto-generate name when panel opens
  useEffect(() => {
    if (step === 'select-type') {
      const joints = useMechanismStore.getState().joints;
      setName(nextJointName(joints));
      setLowerLimit(0);
      setUpperLimit(0);
    }
  }, [step]);

  if (step !== 'select-type') return null;

  const currentType = selectedJointType;
  const currentOption = JOINT_TYPE_OPTIONS.find((o) => o.type === currentType);
  const showLimits = currentOption?.hasLimits ?? false;

  // Sort options: recommended first, then the rest
  const recommendedSet = new Set(recommendedTypes);
  const sortedOptions = [
    ...JOINT_TYPE_OPTIONS.filter((o) => recommendedSet.has(o.type)),
    ...JOINT_TYPE_OPTIONS.filter((o) => !recommendedSet.has(o.type)),
  ];

  const handleCreate = () => {
    if (!parentDatumId || !childDatumId || !currentType) return;
    const trimmedName = name.trim() || 'Joint';
    sendCreateJoint(
      parentDatumId,
      childDatumId,
      currentType,
      trimmedName,
      showLimits ? lowerLimit : 0,
      showLimits ? upperLimit : 0,
    );
    reset();
  };

  const handleCancel = () => {
    cancel();
  };

  return (
    <FloatingToolCard
      icon={<Link2 className="size-3.5" />}
      title="Create Joint"
      onClose={handleCancel}
      defaultPosition={{ x: 12, y: 12 }}
      className="w-[260px]"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={!currentType}>
            Create
          </Button>
        </>
      }
    >
      {/* Datum summary */}
      <div className="ps-2 pe-1.5 py-1.5 text-[length:var(--text-xs)] text-[var(--text-secondary)]">
        {parentDatum?.name ?? '?'} → {childDatum?.name ?? '?'}
      </div>

      {/* Joint type selector */}
      <div className="border-t border-[var(--border-subtle)]">
        <div className="ps-2 pe-1.5 py-1 text-[length:var(--text-xs)] font-semibold text-[var(--text-secondary)]">
          Joint Type
        </div>
        <div className="flex flex-col">
          {sortedOptions.map((option) => {
            const isSelected = option.type === currentType;
            const isRecommended = recommendedSet.has(option.type);
            return (
              <button
                key={option.type}
                type="button"
                className={`flex items-center gap-2 ps-2 pe-1.5 py-1 text-[length:var(--text-xs)] transition-colors
                  ${isSelected
                    ? 'bg-[var(--accent-primary)]/10 text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--layer-hover)]'
                  }`}
                onClick={() => selectJointType(option.type)}
                onMouseEnter={() => setPreviewJointType(option.type)}
                onMouseLeave={() => setPreviewJointType(null)}
              >
                <span className="flex size-4 shrink-0 items-center justify-center">
                  {option.icon}
                </span>
                <span className="flex-1 text-start">{option.label}</span>
                <span className="text-[var(--text-muted)] tabular-nums">{option.dof}</span>
                {isRecommended && (
                  <Badge variant="outline" className="ms-1 text-[10px] leading-none py-0 px-1">
                    Rec
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Name and limits */}
      <div className="border-t border-[var(--border-subtle)] ps-2 pe-1.5 py-1.5 flex flex-col gap-1">
        <PropertyRow label="Name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
            }}
            className="h-5 text-xs"
          />
        </PropertyRow>
        {showLimits && (
          <>
            <PropertyRow
              label="Lower"
              unit={currentType === 'revolute' ? 'rad' : 'm'}
            >
              <NumericInput
                value={lowerLimit}
                onChange={setLowerLimit}
                step={currentType === 'revolute' ? 0.1 : 0.01}
                precision={4}
              />
            </PropertyRow>
            <PropertyRow
              label="Upper"
              unit={currentType === 'revolute' ? 'rad' : 'm'}
            >
              <NumericInput
                value={upperLimit}
                onChange={setUpperLimit}
                step={currentType === 'revolute' ? 0.1 : 0.01}
                precision={4}
              />
            </PropertyRow>
          </>
        )}
      </div>
    </FloatingToolCard>
  );
}
