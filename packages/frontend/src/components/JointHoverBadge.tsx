import type { SceneGraphManager } from '@motionlab/viewport';
import { DOF_TABLE } from '@motionlab/viewport';

import { useMechanismStore } from '../stores/mechanism.js';
import { useSelectionStore } from '../stores/selection.js';
import { WorldSpaceOverlay } from './WorldSpaceOverlay.js';

/**
 * Shows a small DOF label badge floating above a joint when hovered.
 * Positioned via WorldSpaceOverlay at the joint's 3D position.
 */
export function JointHoverBadge({ sceneGraph }: { sceneGraph: SceneGraphManager | null }) {
  const hoveredId = useSelectionStore((s) => s.hoveredId);
  const joint = useMechanismStore((s) => (hoveredId ? s.joints.get(hoveredId) : undefined));

  if (!sceneGraph || !hoveredId || !joint) return null;

  const worldPosition = sceneGraph.getEntityWorldPosition(hoveredId);
  if (!worldPosition) return null;

  const dof = DOF_TABLE[joint.type];
  if (!dof) return null;

  return (
    <WorldSpaceOverlay
      worldPosition={worldPosition}
      sceneGraph={sceneGraph}
      offset={{ x: 0, y: -12 }}
    >
      <div className="rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground backdrop-blur-sm whitespace-nowrap">
        {joint.name} &middot; {dof.label}
      </div>
    </WorldSpaceOverlay>
  );
}
