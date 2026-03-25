import {
  Button,
  CopyableId,
  EditableInertiaMatrix,
  InertiaMatrixDisplay,
  InspectorPanel,
  InspectorSection,
  NumericInput,
  PropertyRow,
  QuatDisplay,
  Switch,
  Vec3Display,
  formatEngValue,
} from '@motionlab/ui';
import type { Axis } from '@motionlab/ui';
import { Box, Fingerprint, Grid3X3, Move3D, Scale } from 'lucide-react';
import { useCallback, useRef } from 'react';
import { sendUpdateBody, sendUpdateMassProperties } from '../engine/connection.js';
import { getBodyPose } from '../stores/body-poses.js';
import type { BodyMassProperties } from '../stores/mechanism.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSelectionStore } from '../stores/selection.js';
import { useSimulationStore } from '../stores/simulation.js';

const DEBOUNCE_MS = 300;

export function BodyInspector() {
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const bodies = useMechanismStore((s) => s.bodies);
  const geometries = useMechanismStore((s) => s.geometries);
  const simState = useSimulationStore((s) => s.state);
  // Subscribe to simTime as a refresh trigger for live pose readout
  useSimulationStore((s) => s.simTime);

  const firstId = selectedIds.values().next().value as string | undefined;
  const body = firstId ? bodies.get(firstId) : undefined;
  const isSimulating = simState === 'running' || simState === 'paused';
  const livePose = firstId && isSimulating ? getBodyPose(firstId) : undefined;

  // Debounce mass property updates to avoid flooding WebSocket during rapid edits
  const massUpdateTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const debouncedMassUpdate = useCallback(
    (bodyId: string, override: boolean, mp?: BodyMassProperties) => {
      clearTimeout(massUpdateTimer.current);
      massUpdateTimer.current = setTimeout(() => {
        sendUpdateMassProperties(bodyId, override, mp);
      }, DEBOUNCE_MS);
    },
    [],
  );

  if (!body) {
    return <InspectorPanel />;
  }

  const { massProperties: mp } = body;
  const geometryCount = [...geometries.values()].filter(
    (g) => g.parentBodyId === body.id,
  ).length;
  const sourceFilename =
    [...geometries.values()].find((g) => g.parentBodyId === body.id)
      ?.sourceAssetRef.originalFilename || '\u2014';

  return (
    <InspectorPanel
      entityName={body.name}
      entityType="Body"
      entityIcon={<Box className="size-5" />}
    >
      <InspectorSection title="Identity" icon={<Fingerprint className="size-3.5" />}>
        <PropertyRow label="Name">
          <span className="text-2xs truncate">{body.name}</span>
        </PropertyRow>
        <PropertyRow label="Source">
          <span className="text-2xs truncate">{sourceFilename}</span>
        </PropertyRow>
        <PropertyRow label="Body ID">
          <CopyableId value={body.id} />
        </PropertyRow>
        <PropertyRow label="Fixed (Ground)">
          <div className="flex items-center gap-1.5">
            <Switch

              checked={body.isFixed ?? false}
              onCheckedChange={(checked) =>
                sendUpdateBody(body.id, { isFixed: checked })
              }
              disabled={isSimulating}
            />
            <span className="text-2xs text-[var(--text-secondary)]">
              {body.isFixed ? 'Yes' : 'No'}
            </span>
          </div>
        </PropertyRow>
      </InspectorSection>

      <InspectorSection title="Mass Properties" icon={<Scale className="size-3.5" />}>
        <PropertyRow label="Source">
          <span className="text-2xs text-[var(--text-secondary)]">
            {body.massOverride
              ? 'User override'
              : geometryCount > 0
                ? `Computed from ${geometryCount} ${geometryCount === 1 ? 'geometry' : 'geometries'}`
                : 'Computed (no geometry attached)'}
          </span>
        </PropertyRow>
        <PropertyRow label="Override">
          <Switch
            checked={body.massOverride ?? false}
            onCheckedChange={(checked) => {
              if (checked) {
                // Switch to override — keep current values as starting point
                sendUpdateMassProperties(body.id, true, body.massProperties);
              } else {
                // Revert to computed — engine will recalculate from geometries
                sendUpdateMassProperties(body.id, false);
              }
            }}
            disabled={isSimulating}
          />
        </PropertyRow>
        <PropertyRow label="Mass" unit="kg" numeric>
          {body.massOverride ? (
            <NumericInput
              value={mp.mass}
              onChange={(v) =>
                debouncedMassUpdate(body.id, true, { ...mp, mass: v })
              }
              min={0.001}
              step={0.1}
              disabled={isSimulating}
            />
          ) : (
            <span className="font-[family-name:var(--font-mono)] tabular-nums">
              {formatEngValue(mp.mass)}
            </span>
          )}
        </PropertyRow>
        <Vec3Display
          label="Center of Mass"
          value={mp.centerOfMass}
          unit="m"
          editable={body.massOverride && !isSimulating}
          onChange={(axis: Axis, val: number) => {
            const newCom = { ...mp.centerOfMass, [axis]: val };
            debouncedMassUpdate(body.id, true, { ...mp, centerOfMass: newCom });
          }}
        />
      </InspectorSection>

      <InspectorSection title="Inertia Tensor" icon={<Grid3X3 className="size-3.5" />}>
        {body.massOverride ? (
          <EditableInertiaMatrix
            ixx={mp.ixx}
            iyy={mp.iyy}
            izz={mp.izz}
            ixy={mp.ixy}
            ixz={mp.ixz}
            iyz={mp.iyz}
            unit="kg m²"
            onChange={(values) =>
              debouncedMassUpdate(body.id, true, { ...mp, ...values })
            }
            disabled={isSimulating}
          />
        ) : (
          <InertiaMatrixDisplay
            ixx={mp.ixx}
            iyy={mp.iyy}
            izz={mp.izz}
            ixy={mp.ixy}
            ixz={mp.ixz}
            iyz={mp.iyz}
            unit="kg m²"
          />
        )}
      </InspectorSection>

      {body.massOverride && (
        <div className="ps-3 pe-3 pb-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => sendUpdateMassProperties(body.id, false)}
            disabled={isSimulating}
          >
            Recalculate from Geometry
          </Button>
        </div>
      )}

      {livePose && (
        <InspectorSection title="Current Pose" icon={<Move3D className="size-3.5" />}>
          <Vec3Display label="Position" value={livePose.position} unit="m" />
          <QuatDisplay value={livePose.rotation} label="Rotation" />
        </InspectorSection>
      )}
    </InspectorPanel>
  );
}
