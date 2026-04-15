import {
  formatEngValue,
  InspectorPanel,
  InspectorSection,
  NumericInput,
  PropertyRow,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Vec3Display,
} from '@motionlab/ui';
import { Activity, MapPin, Zap } from 'lucide-react';
import { useMemo } from 'react';

import { sendUpdateLoad } from '../engine/connection.js';
import type { LoadState, ReferenceFrameId } from '../stores/mechanism.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSelectionStore } from '../stores/selection.js';
import { useSimulationStore } from '../stores/simulation.js';
import { useTraceStore } from '../stores/traces.js';
import { nearestSample } from '../utils/nearest-sample.js';
import { getLoadChannelIds } from '../utils/runtime-channel-ids.js';
import { IdentitySection } from './inspector/sections/index.js';

const LOAD_TYPE_LABELS: Record<string, string> = {
  'point-force': 'Point Force',
  'point-torque': 'Point Torque',
  'spring-damper': 'Spring-Damper',
};

function EntityRef({ entityId, name }: { entityId: string; name: string }) {
  const select = useSelectionStore((s) => s.select);
  const setHovered = useSelectionStore((s) => s.setHovered);
  return (
    <button
      type="button"
      className="truncate cursor-pointer text-2xs hover:underline"
      onClick={() => select(entityId)}
      onMouseEnter={() => setHovered(entityId)}
      onMouseLeave={() => setHovered(null)}
      title={name}
    >
      {name}
    </button>
  );
}

function updateLoad(load: LoadState, updates: Partial<LoadState>): void {
  sendUpdateLoad({ ...load, ...updates });
}

export function LoadInspector({ loadId }: { loadId: string }) {
  const load = useMechanismStore((s) => s.loads.get(loadId));
  const datum = useMechanismStore((s) => (load?.datumId ? s.datums.get(load.datumId) : undefined));
  const parentDatum = useMechanismStore((s) =>
    load?.parentDatumId ? s.datums.get(load.parentDatumId) : undefined,
  );
  const childDatum = useMechanismStore((s) =>
    load?.childDatumId ? s.datums.get(load.childDatumId) : undefined,
  );

  const simState = useSimulationStore((s) => s.state);
  const simTime = useSimulationStore((s) => s.simTime);
  const traces = useTraceStore((s) => s.traces);
  const channels = useTraceStore((s) => s.channels);
  const isSimulating = simState === 'running' || simState === 'paused';

  const magnitude = useMemo(() => {
    if (!load?.vector) return 0;
    const { x, y, z } = load.vector;
    return Math.sqrt(x * x + y * y + z * z);
  }, [load?.vector]);

  if (!load) return <InspectorPanel />;

  const isForceOrTorque = load.type === 'point-force' || load.type === 'point-torque';
  const isSpringDamper = load.type === 'spring-damper';
  const unit = load.type === 'point-force' ? 'N' : load.type === 'point-torque' ? 'Nm' : '';

  return (
    <InspectorPanel
      entityName={load.name}
      entityType="Load"
      entityIcon={<Zap className="size-5" />}
    >
      <IdentitySection
        entityId={loadId}
        entityType="load"
        name={load.name}
        onRename={(newName) => updateLoad(load, { name: newName })}
        metadata={[
          {
            label: 'Type',
            value: <span className="text-2xs">{LOAD_TYPE_LABELS[load.type] ?? load.type}</span>,
          },
        ]}
        disabled={isSimulating}
      />

      {/* Application — point force / point torque */}
      {isForceOrTorque && (
        <InspectorSection title="Application" icon={<MapPin className="size-3.5" />}>
          {datum && (
            <PropertyRow label="Datum">
              <EntityRef entityId={datum.id} name={datum.name} />
            </PropertyRow>
          )}
          <PropertyRow label={`X (${unit})`} numeric>
            <NumericInput
              variant="inline"
              value={load.vector?.x ?? 0}
              onChange={(v) => updateLoad(load, { vector: { ...load.vector!, x: v } })}
              step={1}
              precision={3}
              disabled={isSimulating}
            />
          </PropertyRow>
          <PropertyRow label={`Y (${unit})`} numeric>
            <NumericInput
              variant="inline"
              value={load.vector?.y ?? 0}
              onChange={(v) => updateLoad(load, { vector: { ...load.vector!, y: v } })}
              step={1}
              precision={3}
              disabled={isSimulating}
            />
          </PropertyRow>
          <PropertyRow label={`Z (${unit})`} numeric>
            <NumericInput
              variant="inline"
              value={load.vector?.z ?? 0}
              onChange={(v) => updateLoad(load, { vector: { ...load.vector!, z: v } })}
              step={1}
              precision={3}
              disabled={isSimulating}
            />
          </PropertyRow>
          <PropertyRow label="Magnitude" unit={unit} numeric>
            <span className="font-[family-name:var(--font-mono)] tabular-nums">
              {formatEngValue(magnitude)}
            </span>
          </PropertyRow>
          <PropertyRow label="Reference Frame">
            <Select
              value={load.referenceFrame ?? 'world'}
              onValueChange={(v) => updateLoad(load, { referenceFrame: v as ReferenceFrameId })}
            >
              <SelectTrigger size="sm" disabled={isSimulating}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="world">World</SelectItem>
                <SelectItem value="datum-local">Body-Local</SelectItem>
              </SelectContent>
            </Select>
          </PropertyRow>
        </InspectorSection>
      )}

      {/* Application — spring-damper */}
      {isSpringDamper && (
        <InspectorSection title="Application" icon={<MapPin className="size-3.5" />}>
          {parentDatum && (
            <PropertyRow label="Parent Datum">
              <EntityRef entityId={parentDatum.id} name={parentDatum.name} />
            </PropertyRow>
          )}
          {childDatum && (
            <PropertyRow label="Child Datum">
              <EntityRef entityId={childDatum.id} name={childDatum.name} />
            </PropertyRow>
          )}
          <PropertyRow label="Rest Length" unit="m" numeric>
            <NumericInput
              variant="inline"
              value={load.restLength ?? 0}
              onChange={(v) => updateLoad(load, { restLength: v })}
              min={0}
              step={0.01}
              precision={4}
              disabled={isSimulating}
            />
          </PropertyRow>
          <PropertyRow label="Stiffness" unit="N/m" numeric>
            <NumericInput
              variant="inline"
              value={load.stiffness ?? 0}
              onChange={(v) => updateLoad(load, { stiffness: v })}
              min={0}
              step={100}
              precision={1}
              disabled={isSimulating}
            />
          </PropertyRow>
          <PropertyRow label="Damping" unit="Ns/m" numeric>
            <NumericInput
              variant="inline"
              value={load.damping ?? 0}
              onChange={(v) => updateLoad(load, { damping: v })}
              min={0}
              step={1}
              precision={2}
              disabled={isSimulating}
            />
          </PropertyRow>
        </InspectorSection>
      )}

      {/* Simulation Values */}
      {isSimulating &&
        (() => {
          if (isForceOrTorque) {
            const channelId = getLoadChannelIds(loadId, load.type).vector;
            if (!channelId) return null;
            const samples = traces.get(channelId);
            const val = samples ? nearestSample(samples, simTime) : undefined;
            const hasChannel = channels.has(channelId);

            if (!hasChannel) return null;

            return (
              <InspectorSection title="Simulation Values" icon={<Activity className="size-3.5" />}>
                {val?.vec ? (
                  <Vec3Display
                    label={load.type === 'point-force' ? 'Applied Force' : 'Applied Torque'}
                    value={val.vec}
                    unit={unit}
                  />
                ) : (
                  <PropertyRow
                    label={load.type === 'point-force' ? 'Applied Force' : 'Applied Torque'}
                  >
                    <span className="text-2xs text-text-tertiary">Awaiting data...</span>
                  </PropertyRow>
                )}
              </InspectorSection>
            );
          }

          if (isSpringDamper) {
            const {
              length: lengthId,
              force: springForceId,
              lengthRate,
            } = getLoadChannelIds(loadId, load.type);
            if (!lengthId || !springForceId) return null;
            const lengthSamples = traces.get(lengthId);
            const forceSamples = traces.get(springForceId);
            const lengthRateSamples = lengthRate ? traces.get(lengthRate) : undefined;
            const lengthVal = lengthSamples ? nearestSample(lengthSamples, simTime) : undefined;
            const forceVal = forceSamples ? nearestSample(forceSamples, simTime) : undefined;
            const lengthRateVal = lengthRateSamples
              ? nearestSample(lengthRateSamples, simTime)
              : undefined;
            const hasAny =
              channels.has(lengthId) ||
              channels.has(springForceId) ||
              (lengthRate ? channels.has(lengthRate) : false);

            if (!hasAny) return null;

            const stretch =
              lengthVal !== undefined && load.restLength !== undefined
                ? lengthVal.value - load.restLength
                : undefined;

            return (
              <InspectorSection title="Simulation Values" icon={<Activity className="size-3.5" />}>
                {lengthVal !== undefined ? (
                  <PropertyRow label="Current Length" unit="m" numeric>
                    <span className="font-[family-name:var(--font-mono)] tabular-nums">
                      {formatEngValue(lengthVal.value)}
                    </span>
                  </PropertyRow>
                ) : channels.has(lengthId) ? (
                  <PropertyRow label="Current Length">
                    <span className="text-2xs text-text-tertiary">Awaiting data...</span>
                  </PropertyRow>
                ) : null}
                {stretch !== undefined && (
                  <PropertyRow label="Stretch" unit="m" numeric>
                    <span className="font-[family-name:var(--font-mono)] tabular-nums">
                      {formatEngValue(stretch)}
                    </span>
                  </PropertyRow>
                )}
                {lengthRateVal !== undefined ? (
                  <PropertyRow label="Length Rate" unit="m/s" numeric>
                    <span className="font-[family-name:var(--font-mono)] tabular-nums">
                      {formatEngValue(lengthRateVal.value)}
                    </span>
                  </PropertyRow>
                ) : lengthRate && channels.has(lengthRate) ? (
                  <PropertyRow label="Length Rate">
                    <span className="text-2xs text-text-tertiary">Awaiting data...</span>
                  </PropertyRow>
                ) : null}
                {forceVal !== undefined ? (
                  <PropertyRow label="Spring Force" unit="N" numeric>
                    <span className="font-[family-name:var(--font-mono)] tabular-nums">
                      {formatEngValue(forceVal.value)}
                    </span>
                  </PropertyRow>
                ) : channels.has(springForceId) ? (
                  <PropertyRow label="Spring Force">
                    <span className="text-2xs text-text-tertiary">Awaiting data...</span>
                  </PropertyRow>
                ) : null}
              </InspectorSection>
            );
          }

          return null;
        })()}
    </InspectorPanel>
  );
}
