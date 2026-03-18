import { InspectorPanel } from '@motionlab/ui';

import { BodyInspector } from './BodyInspector.js';
import { DatumInspector } from './DatumInspector.js';
import { JointInspector } from './JointInspector.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSelectionStore } from '../stores/selection.js';

/**
 * Routes the right-panel inspector to the correct component
 * based on the type of the first selected entity.
 */
export function EntityInspector() {
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const bodies = useMechanismStore((s) => s.bodies);
  const datums = useMechanismStore((s) => s.datums);
  const joints = useMechanismStore((s) => s.joints);

  const firstId = selectedIds.values().next().value as string | undefined;
  if (!firstId) return <InspectorPanel />;

  if (bodies.has(firstId)) return <BodyInspector />;
  if (datums.has(firstId)) return <DatumInspector datumId={firstId} />;
  if (joints.has(firstId)) return <JointInspector jointId={firstId} />;

  return <InspectorPanel />;
}
