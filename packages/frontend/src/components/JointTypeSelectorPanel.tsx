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

import { sendCreateJoint, sendUpdateJoint } from '../engine/connection.js';
import { useJointCreationStore } from '../stores/joint-creation.js';
import type { JointTypeId } from '../stores/mechanism.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useToolModeStore } from '../stores/tool-mode.js';
import { nextJointName } from '../utils/joint-naming.js';

function DofLabel({ dof }: { dof: string }) {
  if (dof === '0') {
    return <Lock className="size-2.5 text-[var(--text-muted)]" />;
  }
  const parts = dof.split('+');
  return (
    <span className="inline-flex items-center gap-0.5">
      {parts.map((part, i) => {
        const match = part.match(/^(\d+)([RT])$/);
        if (!match) return null;
        const count = parseInt(match[1], 10);
        const type = match[2];
        return (
          <span key={i} className="inline-flex items-center gap-px text-[var(--success)]">
            {count > 1 && <span className="text-[10px] leading-none">{count}</span>}
            {type === 'R' ? (
              <RotateCw className="size-2.5" />
            ) : (
              <ArrowLeftRight className="size-2.5" />
            )}
          </span>
        );
      })}
    </span>
  );
}

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
  const editingJointId = useJointCreationStore((s) => s.editingJointId);
  const exitMode = useJointCreationStore((s) => s.exitMode);

  const isEditing = editingJointId !== null;
  const editingJoint = useMechanismStore((s) =>
    editingJointId ? s.joints.get(editingJointId) : undefined,
  );
  const parentDatum = useMechanismStore((s) =>
    parentDatumId ? s.datums.get(parentDatumId) : undefined,
  );
  const childDatum = useMechanismStore((s) =>
    childDatumId ? s.datums.get(childDatumId) : undefined,
  );
  const parentBody = useMechanismStore((s) =>
    parentDatum ? s.bodies.get(parentDatum.parentBodyId) : undefined,
  );
  const childBody = useMechanismStore((s) =>
    childDatum ? s.bodies.get(childDatum.parentBodyId) : undefined,
  );

  const [name, setName] = useState('');
  const [lowerLimit, setLowerLimit] = useState(0);
  const [upperLimit, setUpperLimit] = useState(0);

  // Auto-generate name when panel opens (create mode) or pre-populate (edit mode)
  useEffect(() => {
    if (step === 'select-type') {
      if (editingJoint) {
        setName(editingJoint.name);
        setLowerLimit(editingJoint.lowerLimit);
        setUpperLimit(editingJoint.upperLimit);
      } else {
        const joints = useMechanismStore.getState().joints;
        setName(nextJointName(joints));
        setLowerLimit(0);
        setUpperLimit(0);
      }
    }
  }, [step, editingJoint]);

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

  const handleCommit = () => {
    if (!parentDatumId || !childDatumId || !currentType) return;
    const trimmedName = name.trim() || 'Joint';
    if (isEditing && editingJointId) {
      sendUpdateJoint(editingJointId, {
        type: currentType,
        name: trimmedName,
        lowerLimit: showLimits ? lowerLimit : 0,
        upperLimit: showLimits ? upperLimit : 0,
      });
      exitMode();
      useToolModeStore.getState().setMode('select');
    } else {
      sendCreateJoint(
        parentDatumId,
        childDatumId,
        currentType,
        trimmedName,
        showLimits ? lowerLimit : 0,
        showLimits ? upperLimit : 0,
      );
      reset();
    }
  };

  const handleCancel = () => {
    if (isEditing) {
      exitMode();
      useToolModeStore.getState().setMode('select');
    } else {
      cancel();
    }
  };

  return (
    <FloatingToolCard
      icon={<Link2 className="size-3.5" />}
      title={isEditing ? 'Edit Joint' : 'Create Joint'}
      onClose={handleCancel}
      defaultPosition={{ x: 12, y: 12 }}
      className="w-[260px]"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleCommit} disabled={!currentType}>
            {isEditing ? 'Update' : 'Create'}
          </Button>
        </>
      }
    >
      {/* Datum summary */}
      <div className="ps-2 pe-1.5 py-1.5 text-[length:var(--text-xs)] text-[var(--text-secondary)]">
        {isEditing ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-green-400">Parent: {parentDatum?.name ?? '?'} ({parentBody?.name ?? '?'})</span>
            <span className="text-orange-400">Child: {childDatum?.name ?? '?'} ({childBody?.name ?? '?'})</span>
            <span className="text-[10px] text-[var(--text-muted)] italic">To change datums, delete this joint and create a new one.</span>
          </div>
        ) : (
          <>{parentDatum?.name ?? '?'} → {childDatum?.name ?? '?'}</>
        )}
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
                <DofLabel dof={option.dof} />
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
              if (e.key === 'Enter') handleCommit();
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
