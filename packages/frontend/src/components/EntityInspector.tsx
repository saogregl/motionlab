import { InspectorPanel } from '@motionlab/ui';
import { Layers } from 'lucide-react';

import { useMechanismStore } from '../stores/mechanism.js';
import { useSelectionStore } from '../stores/selection.js';
import { useSimulationStore } from '../stores/simulation.js';
import { ActuatorInspector } from './ActuatorInspector.js';
import { BodyInspector } from './BodyInspector.js';
import { DatumInspector } from './DatumInspector.js';
import { GeometryInspector } from './GeometryInspector.js';
import { JointInspector } from './JointInspector.js';
import { LoadInspector } from './LoadInspector.js';
import { SimulationMetadataSection } from './SimulationMetadataSection.js';

/**
 * Routes the right-panel inspector to the correct component
 * based on the type of the first selected entity.
 *
 * When multiple entities are selected, shows a summary placeholder
 * with a type breakdown instead of a single entity inspector.
 */
export function EntityInspector() {
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const bodies = useMechanismStore((s) => s.bodies);
  const geometries = useMechanismStore((s) => s.geometries);
  const datums = useMechanismStore((s) => s.datums);
  const joints = useMechanismStore((s) => s.joints);
  const loads = useMechanismStore((s) => s.loads);
  const actuators = useMechanismStore((s) => s.actuators);
  const simState = useSimulationStore((s) => s.state);

  const showSimMeta = simState !== 'idle';
  const firstId = selectedIds.values().next().value as string | undefined;

  if (!firstId) {
    return null;
  }

  // Multi-select: show a summary placeholder with type breakdown
  if (selectedIds.size > 1) {
    const counts: Record<string, number> = {};
    for (const id of selectedIds) {
      if (bodies.has(id)) counts['Body'] = (counts['Body'] ?? 0) + 1;
      else if (geometries.has(id)) counts['Geometry'] = (counts['Geometry'] ?? 0) + 1;
      else if (datums.has(id)) counts['Datum'] = (counts['Datum'] ?? 0) + 1;
      else if (joints.has(id)) counts['Joint'] = (counts['Joint'] ?? 0) + 1;
      else if (loads.has(id)) counts['Load'] = (counts['Load'] ?? 0) + 1;
      else if (actuators.has(id)) counts['Actuator'] = (counts['Actuator'] ?? 0) + 1;
    }
    const pluralize = (word: string, n: number) => {
      if (n === 1) return word;
      if (word === 'Body') return 'Bodies';
      if (word === 'Geometry') return 'Geometries';
      return `${word}s`;
    };
    const breakdown = Object.entries(counts)
      .map(([type, count]) => `${count} ${pluralize(type, count)}`)
      .join(', ');
    return (
      <InspectorPanel
        entityName={`${selectedIds.size} items selected`}
        entityIcon={<Layers className="size-5" />}
      >
        <div className="ps-3 pe-3 pt-2">
          <span className="text-2xs text-[var(--text-secondary)]">{breakdown}</span>
        </div>
      </InspectorPanel>
    );
  }

  if (bodies.has(firstId)) {
    return (
      <>
        <BodyInspector />
        {showSimMeta && <SimulationMetadataSection />}
      </>
    );
  }
  if (geometries.has(firstId)) {
    return (
      <>
        <GeometryInspector />
        {showSimMeta && <SimulationMetadataSection />}
      </>
    );
  }
  if (datums.has(firstId)) {
    return (
      <>
        <DatumInspector datumId={firstId} />
        {showSimMeta && <SimulationMetadataSection />}
      </>
    );
  }
  if (joints.has(firstId)) {
    return (
      <>
        <JointInspector jointId={firstId} />
        {showSimMeta && <SimulationMetadataSection />}
      </>
    );
  }
  if (loads.has(firstId)) {
    return (
      <>
        <LoadInspector loadId={firstId} />
        {showSimMeta && <SimulationMetadataSection />}
      </>
    );
  }
  if (actuators.has(firstId)) {
    return (
      <>
        <ActuatorInspector actuatorId={firstId} />
        {showSimMeta && <SimulationMetadataSection />}
      </>
    );
  }

  return null;
}
