import { InspectorPanel } from '@motionlab/ui';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSelectionStore } from '../stores/selection.js';
import { useSimulationStore } from '../stores/simulation.js';
import { BodyInspector } from './BodyInspector.js';
import { DatumInspector } from './DatumInspector.js';
import { GeometryInspector } from './GeometryInspector.js';
import { JointInspector } from './JointInspector.js';
import { MechanismInspector } from './MechanismInspector.js';
import { SimulationMetadataSection } from './SimulationMetadataSection.js';

/**
 * Routes the right-panel inspector to the correct component
 * based on the type of the first selected entity.
 */
export function EntityInspector() {
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const bodies = useMechanismStore((s) => s.bodies);
  const geometries = useMechanismStore((s) => s.geometries);
  const datums = useMechanismStore((s) => s.datums);
  const joints = useMechanismStore((s) => s.joints);
  const loads = useMechanismStore((s) => s.loads);
  const simState = useSimulationStore((s) => s.state);

  const showSimMeta = simState !== 'idle';
  const firstId = selectedIds.values().next().value as string | undefined;

  if (!firstId) {
    return (
      <>
        <MechanismInspector />
        {showSimMeta && <SimulationMetadataSection />}
      </>
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
    const load = loads.get(firstId);
    return (
      <>
        <InspectorPanel>
          <div className="ps-3 pe-3 py-2 text-[length:var(--text-xs)] text-[var(--text-tertiary)]">
            {load?.name ?? 'Load'} ({load?.type ?? 'unknown'}) — full inspector coming in Prompt 3.
          </div>
        </InspectorPanel>
        {showSimMeta && <SimulationMetadataSection />}
      </>
    );
  }

  return <InspectorPanel>{showSimMeta && <SimulationMetadataSection />}</InspectorPanel>;
}
