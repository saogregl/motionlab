import {
  Button,
  InspectorPanel,
  PropertyRow,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@motionlab/ui';
import { Box } from 'lucide-react';
import { useCallback, useMemo, useRef } from 'react';
import {
  sendUpdateBody,
  sendUpdateCollisionConfig,
  sendUpdateMassProperties,
  sendUpdatePrimitive,
} from '../engine/connection.js';
import { getBodyPose } from '../stores/body-poses.js';
import type { BodyMassProperties, GeometryState } from '../stores/mechanism.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSelectionStore } from '../stores/selection.js';
import { useSimulationStore } from '../stores/simulation.js';
import {
  CollisionSection,
  IdentitySection,
  MassSection,
  PrimitiveParamsSection,
  TransformSection,
} from './inspector/sections/index.js';

const MASS_DEBOUNCE_MS = 300;

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
      }, MASS_DEBOUNCE_MS);
    },
    [],
  );

  const childGeometries = useMemo(() => {
    if (!body) return [];
    const result: GeometryState[] = [];
    for (const g of geometries.values()) {
      if (g.parentBodyId === body.id) result.push(g);
    }
    return result;
  }, [geometries, body]);

  const geometryLabel = useMemo(() => {
    if (childGeometries.length === 0) return '\u2014';
    if (childGeometries.length === 1) {
      const g = childGeometries[0];
      if (g.primitiveSource) {
        return g.primitiveSource.shape.charAt(0).toUpperCase() + g.primitiveSource.shape.slice(1);
      }
      return g.sourceAssetRef.originalFilename || 'Mesh';
    }
    return `${childGeometries.length} geometries`;
  }, [childGeometries]);

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
      <TransformSection
        frameLabel="(world)"
        position={body.pose.position}
        rotation={body.pose.rotation}
        disabled={isSimulating}
        onTransformChange={(pose) => sendUpdateBody(body.id, { pose })}
      />

      <IdentitySection
        entityId={body.id}
        entityType="body"
        name={body.name}
        metadata={[
          {
            label: 'Geometry',
            value: <span className="text-2xs truncate">{geometryLabel}</span>,
          },
        ]}
      />

      <PropertyRow label="Motion Type">
        <Select
          value={body.motionType}
          onValueChange={(v) => sendUpdateBody(body.id, { motionType: v as 'dynamic' | 'fixed' })}
        >
          <SelectTrigger size="sm" disabled={isSimulating}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dynamic">Dynamic</SelectItem>
            <SelectItem value="fixed">Fixed (Ground)</SelectItem>
          </SelectContent>
        </Select>
      </PropertyRow>

      {childGeometries.length === 1 && childGeometries[0].primitiveSource && (
        <PrimitiveParamsSection
          geometryId={childGeometries[0].id}
          shape={childGeometries[0].primitiveSource.shape}
          params={childGeometries[0].primitiveSource.params}
          isSimulating={isSimulating}
          onParamsChange={(params) => sendUpdatePrimitive(childGeometries[0].id, params)}
        />
      )}

      {childGeometries.length === 1 && (
        <CollisionSection
          geometryId={childGeometries[0].id}
          collisionConfig={childGeometries[0].collisionConfig}
          isSimulating={isSimulating}
          onConfigChange={(config) => sendUpdateCollisionConfig(childGeometries[0].id, config)}
        />
      )}

      {childGeometries.length > 1 && (
        <div className="ps-3 pe-3 pt-1 pb-1">
          <span className="text-xs text-[var(--text-secondary)]">
            {childGeometries.length} geometries — select individually to edit
          </span>
        </div>
      )}

      <MassSection
        bodyId={body.id}
        massProperties={mp}
        massOverride={body.massOverride ?? false}
        geometryCount={childGeometries.length}
        isSimulating={isSimulating}
        onOverrideChange={(checked) => {
          if (checked) {
            sendUpdateMassProperties(body.id, true, body.massProperties);
          } else {
            sendUpdateMassProperties(body.id, false);
          }
        }}
        onMassPropertiesChange={(newMp) => debouncedMassUpdate(body.id, true, newMp)}
      />

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
        <TransformSection
          frameLabel="(simulation)"
          position={livePose.position}
          rotation={livePose.rotation}
          editable={false}
          defaultOpen={true}
        />
      )}
    </InspectorPanel>
  );
}
