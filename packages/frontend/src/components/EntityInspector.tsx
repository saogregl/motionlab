import { InspectorPanel } from '@motionlab/ui';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSelectionStore } from '../stores/selection.js';
import { useSimulationStore } from '../stores/simulation.js';
import { BodyInspector } from './BodyInspector.js';
import { DatumInspector } from './DatumInspector.js';
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
  const datums = useMechanismStore((s) => s.datums);
  const joints = useMechanismStore((s) => s.joints);
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

  return <InspectorPanel>{showSimMeta && <SimulationMetadataSection />}</InspectorPanel>;
}
