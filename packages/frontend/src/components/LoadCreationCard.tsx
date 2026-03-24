import type { SceneGraphManager } from '@motionlab/viewport';
import {
  Button,
  FloatingToolCard,
  NumericInput,
  PropertyRow,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@motionlab/ui';
import { Zap } from 'lucide-react';
import { useEffect, useState } from 'react';

import { sendCreateLoad } from '../engine/connection.js';
import { useLoadCreationStore } from '../stores/load-creation.js';
import type { LoadTypeId, ReferenceFrameId } from '../stores/mechanism.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useToolModeStore } from '../stores/tool-mode.js';
import { nextLoadName } from '../utils/load-naming.js';
import { WorldSpaceOverlay } from './WorldSpaceOverlay.js';

export function LoadCreationCard({ sceneGraph }: { sceneGraph: SceneGraphManager | null }) {
  const step = useLoadCreationStore((s) => s.step);
  const preselectedType = useLoadCreationStore((s) => s.preselectedLoadType);
  const datumId = useLoadCreationStore((s) => s.datumId);
  const secondDatumId = useLoadCreationStore((s) => s.secondDatumId);
  const beginSecondDatumPick = useLoadCreationStore((s) => s.beginSecondDatumPick);
  const exitMode = useLoadCreationStore((s) => s.exitMode);
  const reset = useLoadCreationStore((s) => s.reset);
  const anchorDatum = useMechanismStore((s) => (datumId ? s.datums.get(datumId) : undefined));
  const secondDatum = useMechanismStore((s) => (secondDatumId ? s.datums.get(secondDatumId) : undefined));

  const [loadType, setLoadType] = useState<LoadTypeId>('point-force');
  const [name, setName] = useState('');
  const [vx, setVx] = useState(0);
  const [vy, setVy] = useState(-9.81);
  const [vz, setVz] = useState(0);
  const [refFrame, setRefFrame] = useState<ReferenceFrameId>('world');
  const [stiffness, setStiffness] = useState(1000);
  const [damping, setDamping] = useState(10);
  const [restLength, setRestLength] = useState(0.1);

  const open = step === 'configure';

  // Auto-generate name and set type when card opens
  useEffect(() => {
    if (open) {
      const loads = useMechanismStore.getState().loads;
      const nextType = preselectedType ?? 'point-force';
      setName(nextLoadName(loads));
      setLoadType(nextType);
      setVx(0);
      setVy(nextType === 'point-force' ? -9.81 : 0);
      setVz(0);
      setRefFrame('world');
      setStiffness(1000);
      setDamping(10);
      setRestLength(0.1);
    }
  }, [open, preselectedType]);

  useEffect(() => {
    if (!sceneGraph || !open || !datumId) {
      sceneGraph?.clearLoadPreview();
      return;
    }

    if (loadType === 'spring-damper' && !secondDatumId) {
      sceneGraph.clearLoadPreview();
      return;
    }

    sceneGraph.showLoadPreview({
      type: loadType,
      datumId,
      parentDatumId: loadType === 'spring-damper' ? datumId : undefined,
      childDatumId: loadType === 'spring-damper' ? secondDatumId ?? undefined : undefined,
      vector:
        loadType === 'point-force' || loadType === 'point-torque'
          ? { x: vx, y: vy, z: vz }
          : undefined,
      referenceFrame: refFrame,
    });

    return () => {
      sceneGraph.clearLoadPreview();
    };
  }, [datumId, loadType, open, refFrame, sceneGraph, secondDatumId, vx, vy, vz]);

  const handleCreate = () => {
    const trimmedName = name.trim() || 'Load';

    if (loadType === 'point-force' || loadType === 'point-torque') {
      if (!datumId) return;
      sendCreateLoad({
        id: '',
        name: trimmedName,
        type: loadType,
        datumId,
        vector: { x: vx, y: vy, z: vz },
        referenceFrame: refFrame,
      });
    } else {
      if (!datumId || !secondDatumId) return;
      sendCreateLoad({
        id: '',
        name: trimmedName,
        type: 'spring-damper',
        parentDatumId: datumId,
        childDatumId: secondDatumId,
        stiffness,
        damping,
        restLength,
      });
    }

    // Reset for rapid authoring — stay in create-load mode
    reset();
  };

  const handleClose = () => {
    sceneGraph?.clearLoadPreview();
    exitMode();
    useToolModeStore.getState().setMode('select');
  };

  if (!open) return null;
  if (!sceneGraph || !datumId) return null;

  const anchorWorldPosition = sceneGraph.getEntityWorldPosition(datumId);
  if (!anchorWorldPosition) return null;

  const unit = loadType === 'point-force' ? 'N' : loadType === 'point-torque' ? 'Nm' : '';

  return (
    <WorldSpaceOverlay
      worldPosition={anchorWorldPosition}
      sceneGraph={sceneGraph}
      offset={{ x: 28, y: -10 }}
      interactive
    >
      <FloatingToolCard
        icon={<Zap className="size-3.5" />}
        title={`Create Load${anchorDatum ? ` on ${anchorDatum.name}` : ''}`}
        onClose={handleClose}
        defaultPosition={{ x: 12, y: 12 }}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={handleClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreate}>
              Create
            </Button>
          </>
        }
      >
        <div className="flex min-w-[280px] flex-col gap-2 ps-2 pe-2 py-2">
          <div className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--layer-base)] px-2 py-1 text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
            Anchor datum: <span className="text-[var(--text-primary)]">{anchorDatum?.name ?? datumId}</span>
          </div>

          <div className="flex flex-col gap-0.5">
            <label className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">Name</label>
            <input
              className="h-6 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--layer-base)] ps-1.5 pe-1.5 text-[length:var(--text-xs)] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
              }}
            />
          </div>

          <div className="flex flex-col gap-0.5">
            <label className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">Type</label>
            <Select
              value={loadType}
              onValueChange={(value) => {
                const nextType = value as LoadTypeId;
                setLoadType(nextType);
                useLoadCreationStore.getState().setPreselectedLoadType(nextType);
                if (nextType === 'spring-damper' && !secondDatumId) {
                  beginSecondDatumPick();
                }
              }}
            >
              <SelectTrigger className="h-6">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="point-force">Point Force</SelectItem>
                <SelectItem value="point-torque">Point Torque</SelectItem>
                <SelectItem value="spring-damper">Spring-Damper</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(loadType === 'point-force' || loadType === 'point-torque') && (
            <>
              <PropertyRow label={`X (${unit})`} numeric>
                <NumericInput variant="inline" value={vx} onChange={setVx} step={1} precision={3} />
              </PropertyRow>
              <PropertyRow label={`Y (${unit})`} numeric>
                <NumericInput variant="inline" value={vy} onChange={setVy} step={1} precision={3} />
              </PropertyRow>
              <PropertyRow label={`Z (${unit})`} numeric>
                <NumericInput variant="inline" value={vz} onChange={setVz} step={1} precision={3} />
              </PropertyRow>
              <div className="flex flex-col gap-0.5">
                <label className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
                  Reference Frame
                </label>
                <Select value={refFrame} onValueChange={(v) => setRefFrame(v as ReferenceFrameId)}>
                  <SelectTrigger className="h-6">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="world">World</SelectItem>
                    <SelectItem value="datum-local">Body-Local</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {loadType === 'spring-damper' && (
            <>
              <div className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--layer-base)] px-2 py-1 text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
                Target datum:{' '}
                <span className="text-[var(--text-primary)]">
                  {secondDatum?.name ?? 'Pick a second datum in the viewport'}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={() => beginSecondDatumPick()}>
                {secondDatum ? 'Repick Target Datum' : 'Pick Target Datum'}
              </Button>
              <PropertyRow label="Stiffness (N/m)" numeric>
                <NumericInput
                  variant="inline"
                  value={stiffness}
                  onChange={setStiffness}
                  min={0}
                  step={100}
                  precision={1}
                />
              </PropertyRow>
              <PropertyRow label="Damping (Ns/m)" numeric>
                <NumericInput
                  variant="inline"
                  value={damping}
                  onChange={setDamping}
                  min={0}
                  step={1}
                  precision={2}
                />
              </PropertyRow>
              <PropertyRow label="Rest Length (m)" numeric>
                <NumericInput
                  variant="inline"
                  value={restLength}
                  onChange={setRestLength}
                  min={0}
                  step={0.01}
                  precision={4}
                />
              </PropertyRow>
            </>
          )}
        </div>
      </FloatingToolCard>
    </WorldSpaceOverlay>
  );
}
