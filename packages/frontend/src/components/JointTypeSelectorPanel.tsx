import {
  Button,
  FloatingToolCard,
  Input,
  NumericInput,
  PropertyRow,
} from '@motionlab/ui';
import {
  ArrowLeftRight,
  Check,
  Circle,
  CircleDot,
  Cylinder,
  Link2,
  Lock,
  Move,
  RotateCw,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { sendCreateJoint, sendUpdateJoint } from '../engine/connection.js';
import { useJointCreationStore } from '../stores/joint-creation.js';
import type { AlignmentKind } from '../utils/datum-alignment.js';
import type { JointTypeId } from '../stores/mechanism.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useToolModeStore } from '../stores/tool-mode.js';
import { nextJointName } from '../utils/joint-naming.js';

/* ── Helpers ── */

function alignmentKindLabel(kind: AlignmentKind): string {
  switch (kind) {
    case 'coaxial': return 'Coaxial';
    case 'coplanar': return 'Coplanar';
    case 'coincident': return 'Coincident';
    case 'perpendicular': return 'Perpendicular';
    case 'general': return 'General';
  }
}

function formatDistance(d: number): string {
  if (d < 0.001) return '<1 mm';
  if (d < 1) return `${(d * 1000).toFixed(1)} mm`;
  return `${d.toFixed(3)} m`;
}

function dofText(dof: string): string {
  if (dof === '0') return '0 DOF';
  return dof.replace(/(\d)R/g, '$1 rot').replace(/(\d)T/g, '$1 trans').replace(/\+/g, ', ');
}

/* ── Type options ── */

interface JointTypeOption {
  type: JointTypeId;
  label: string;
  description: string;
  dof: string;
  icon: React.ReactNode;
  hasLimits: boolean;
}

const JOINT_TYPE_OPTIONS: JointTypeOption[] = [
  { type: 'revolute', label: 'Revolute', description: 'Hinge — 1 rotational DOF', dof: '1R', icon: <RotateCw className="size-3.5" />, hasLimits: true },
  { type: 'prismatic', label: 'Prismatic', description: 'Slider — 1 translational DOF', dof: '1T', icon: <ArrowLeftRight className="size-3.5" />, hasLimits: true },
  { type: 'fixed', label: 'Fixed', description: 'Rigid — no relative motion', dof: '0', icon: <Lock className="size-3.5" />, hasLimits: false },
  { type: 'spherical', label: 'Spherical', description: 'Ball joint — 3 rotational DOF', dof: '3R', icon: <Circle className="size-3.5" />, hasLimits: false },
  { type: 'cylindrical', label: 'Cylindrical', description: 'Rotation + translation on axis', dof: '1R+1T', icon: <Cylinder className="size-3.5" />, hasLimits: true },
  { type: 'planar', label: 'Planar', description: 'Slide on a plane', dof: '1R+2T', icon: <Move className="size-3.5" />, hasLimits: false },
  { type: 'universal', label: 'Universal', description: 'Two-axis hinge', dof: '2R', icon: <RotateCw className="size-3.5" />, hasLimits: false },
  { type: 'distance', label: 'Distance', description: 'Constrains separation distance', dof: '5', icon: <Link2 className="size-3.5" />, hasLimits: true },
  { type: 'point-line', label: 'Point-Line', description: 'Point constrained to a line', dof: '4', icon: <ArrowLeftRight className="size-3.5" />, hasLimits: false },
  { type: 'point-plane', label: 'Point-Plane', description: 'Point constrained to a plane', dof: '3', icon: <Move className="size-3.5" />, hasLimits: false },
];

/* ── Connection slot ── */

function ConnectionSlot({
  role,
  bodyName,
  datumName,
  isPicking,
}: {
  role: string;
  bodyName: string | null;
  datumName: string | null;
  isPicking: boolean;
}) {
  const filled = bodyName !== null;
  return (
    <div className="flex items-center gap-1.5 min-h-[20px]">
      <span className="flex size-3.5 shrink-0 items-center justify-center">
        {filled ? (
          <Check className="size-3 text-[var(--accent-primary)]" />
        ) : isPicking ? (
          <CircleDot className="size-3 text-[var(--accent-primary)] animate-pulse" />
        ) : (
          <Circle className="size-3 text-[var(--text-muted)]" />
        )}
      </span>
      <span className="text-[10px] text-[var(--text-muted)] w-8 shrink-0">{role}</span>
      {filled ? (
        <span className="text-[var(--text-primary)] truncate text-xs">
          {bodyName} <span className="text-[var(--text-muted)]">/ {datumName}</span>
        </span>
      ) : isPicking ? (
        <span className="text-[var(--accent-primary)] text-xs italic">Click a surface...</span>
      ) : (
        <span className="text-[var(--text-muted)] text-xs">—</span>
      )}
    </div>
  );
}

/* ── Main panel ── */

export function JointTypeSelectorPanel() {
  const step = useJointCreationStore((s) => s.step);
  const parentDatumId = useJointCreationStore((s) => s.parentDatumId);
  const childDatumId = useJointCreationStore((s) => s.childDatumId);
  const recommendedTypes = useJointCreationStore((s) => s.recommendedTypes);
  const selectedJointType = useJointCreationStore((s) => s.selectedJointType);
  const selectJointType = useJointCreationStore((s) => s.selectJointType);
  const setPreviewJointType = useJointCreationStore((s) => s.setPreviewJointType);
  const alignmentKind = useJointCreationStore((s) => s.alignmentKind);
  const alignment = useJointCreationStore((s) => s.alignment);
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
  const [limitsEnabled, setLimitsEnabled] = useState(false);
  const [lowerLimit, setLowerLimit] = useState(0);
  const [upperLimit, setUpperLimit] = useState(0);

  // Auto-generate name when panel opens or pre-populate in edit mode
  useEffect(() => {
    if (step === 'pick-parent' || step === 'select-type') {
      if (editingJoint) {
        setName(editingJoint.name);
        const hasLimits = editingJoint.lowerLimit !== 0 || editingJoint.upperLimit !== 0;
        setLimitsEnabled(hasLimits);
        setLowerLimit(editingJoint.lowerLimit);
        setUpperLimit(editingJoint.upperLimit);
      } else {
        const joints = useMechanismStore.getState().joints;
        setName(nextJointName(joints));
        setLimitsEnabled(false);
        setLowerLimit(0);
        setUpperLimit(0);
      }
    }
  }, [step, editingJoint]);

  // Show for all active steps, not just select-type
  if (step === 'idle') return null;

  const currentType = selectedJointType;
  const currentOption = JOINT_TYPE_OPTIONS.find((o) => o.type === currentType);
  const showLimits = currentOption?.hasLimits ?? false;
  const canCreate = !!parentDatumId && !!childDatumId && !!currentType;

  // Sort: recommended first
  const recommendedSet = useMemo(() => new Set(recommendedTypes), [recommendedTypes]);
  const sortedOptions = useMemo(() => [
    ...JOINT_TYPE_OPTIONS.filter((o) => recommendedSet.has(o.type)),
    ...JOINT_TYPE_OPTIONS.filter((o) => !recommendedSet.has(o.type)),
  ], [recommendedSet]);

  const handleCommit = () => {
    if (!parentDatumId || !childDatumId || !currentType) return;
    const trimmedName = name.trim() || 'Joint';
    const effectiveLower = showLimits && limitsEnabled ? lowerLimit : 0;
    const effectiveUpper = showLimits && limitsEnabled ? upperLimit : 0;
    if (isEditing && editingJointId) {
      sendUpdateJoint(editingJointId, {
        type: currentType,
        name: trimmedName,
        lowerLimit: effectiveLower,
        upperLimit: effectiveUpper,
      });
      exitMode();
      useToolModeStore.getState().setMode('select');
    } else {
      sendCreateJoint(
        parentDatumId,
        childDatumId,
        currentType,
        trimmedName,
        effectiveLower,
        effectiveUpper,
      );
      reset();
    }
  };

  const handleCancel = () => {
    exitMode();
    useToolModeStore.getState().setMode('select');
  };

  return (
    <FloatingToolCard
      icon={<Link2 className="size-3.5" />}
      title={isEditing ? 'Edit Joint' : 'Create Joint'}
      onClose={handleCancel}
      defaultPosition={{ x: 12, y: 12 }}
      className="w-[280px]"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleCommit} disabled={!canCreate}>
            {isEditing ? 'Update' : 'Create'}
          </Button>
        </>
      }
    >
      {/* Connection slots */}
      <div className="ps-2 pe-1.5 py-1.5 flex flex-col gap-0.5">
        <ConnectionSlot
          role="A"
          bodyName={parentBody?.name ?? null}
          datumName={parentDatum?.name ?? null}
          isPicking={step === 'pick-parent'}
        />
        <ConnectionSlot
          role="B"
          bodyName={childBody?.name ?? null}
          datumName={childDatum?.name ?? null}
          isPicking={step === 'pick-child'}
        />
        {isEditing && (
          <span className="ps-5 text-[10px] text-[var(--text-muted)] italic">
            To change surfaces, delete and recreate.
          </span>
        )}
      </div>

      {/* Alignment badge */}
      {alignmentKind && alignmentKind !== 'general' && !isEditing && (
        <div className="border-t border-[var(--border-subtle)] ps-2 pe-1.5 py-1">
          <span className="text-[10px] text-[var(--text-secondary)]">
            {alignmentKindLabel(alignmentKind)}
            {alignment && alignment.distance > 0.001 && (
              <span className="text-[var(--text-muted)]"> — {formatDistance(alignment.distance)}</span>
            )}
          </span>
        </div>
      )}

      {/* Joint type selector */}
      <div className="border-t border-[var(--border-subtle)]">
        <div className="ps-2 pe-1.5 py-1 text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
          Type
        </div>
        <div className="flex flex-col pb-0.5">
          {sortedOptions.map((option) => {
            const isSelected = option.type === currentType;
            const isRecommended = recommendedSet.has(option.type);
            return (
              <button
                key={option.type}
                type="button"
                className={`flex items-center gap-2 ps-2 pe-1.5 h-7 text-xs transition-colors
                  ${isSelected
                    ? 'bg-[var(--accent-primary)]/10 text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--layer-hover)]'
                  }`}
                onClick={() => selectJointType(option.type)}
                onMouseEnter={() => setPreviewJointType(option.type)}
                onMouseLeave={() => setPreviewJointType(null)}
              >
                <span className="flex size-4 shrink-0 items-center justify-center text-[var(--text-muted)]">
                  {option.icon}
                </span>
                <span className="flex-1 text-start">{option.label}</span>
                {isRecommended && !isEditing && (
                  <span className="text-[9px] text-[var(--accent-primary)] opacity-70">best</span>
                )}
                <span className="text-[10px] text-[var(--text-muted)] tabular-nums w-12 text-end">
                  {dofText(option.dof)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Name and limits */}
      <div className="border-t border-[var(--border-subtle)] ps-2 pe-1.5 py-1.5 flex flex-col gap-1.5">
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
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={limitsEnabled}
                onChange={(e) => {
                  const on = e.target.checked;
                  setLimitsEnabled(on);
                  if (on && lowerLimit === 0 && upperLimit === 0) {
                    if (currentType === 'revolute') {
                      setLowerLimit(-Math.PI);
                      setUpperLimit(Math.PI);
                    } else {
                      setLowerLimit(-0.1);
                      setUpperLimit(0.1);
                    }
                  }
                }}
                className="size-3 accent-[var(--accent-primary)]"
              />
              <span className="text-[10px] text-[var(--text-secondary)]">Enable limits</span>
            </label>
            {limitsEnabled && (
              <div className="flex flex-col gap-1">
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
              </div>
            )}
          </>
        )}
      </div>
    </FloatingToolCard>
  );
}
