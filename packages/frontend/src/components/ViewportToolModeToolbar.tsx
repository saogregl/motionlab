import { ToolbarButton } from '@motionlab/ui';
import { Crosshair, Link2, MousePointer2, Move, RotateCw, X } from 'lucide-react';

import { useAuthoringStatusStore } from '../stores/authoring-status.js';
import { useJointCreationStore } from '../stores/joint-creation.js';
import { useSimulationStore } from '../stores/simulation.js';
import { useToolModeStore } from '../stores/tool-mode.js';

export function ViewportToolModeToolbar() {
  const activeMode = useToolModeStore((s) => s.activeMode);
  const gizmoMode = useToolModeStore((s) => s.gizmoMode);
  const setMode = useToolModeStore((s) => s.setMode);
  const setGizmoMode = useToolModeStore((s) => s.setGizmoMode);
  const simState = useSimulationStore((s) => s.state);
  const isSimulating = simState === 'running' || simState === 'paused';

  return (
    <div className="flex flex-col gap-0.5 rounded-[var(--panel-radius)] border border-[var(--border-default)] bg-layer-base p-0.5">
      {/* Tool modes */}
      <ToolbarButton
        tooltip="Select"
        shortcut="V"
        active={activeMode === 'select'}
        onClick={() => {
          setMode('select');
          useJointCreationStore.getState().exitMode();
          useAuthoringStatusStore.getState().clearMessage();
        }}
      >
        <MousePointer2 className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        tooltip="Create Datum"
        shortcut="D"
        active={activeMode === 'create-datum'}
        disabled={isSimulating}
        onClick={() => setMode('create-datum')}
      >
        <Crosshair className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        tooltip="Create Joint"
        shortcut="J"
        active={activeMode === 'create-joint'}
        disabled={isSimulating}
        onClick={() => {
          setMode('create-joint');
          const store = useJointCreationStore.getState();
          store.setPreselectedJointType(null);
          store.startCreation();
        }}
      >
        <Link2 className="size-4" />
      </ToolbarButton>

      {/* Separator */}
      <div className="mx-0.5 h-px bg-[var(--border-default)]" />

      {/* Gizmo modes */}
      <ToolbarButton
        tooltip="Translate"
        shortcut="W"
        active={gizmoMode === 'translate'}
        onClick={() => setGizmoMode('translate')}
      >
        <Move className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        tooltip="Rotate"
        shortcut="E"
        active={gizmoMode === 'rotate'}
        onClick={() => setGizmoMode('rotate')}
      >
        <RotateCw className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        tooltip="Gizmo Off"
        shortcut="Q"
        active={gizmoMode === 'off'}
        onClick={() => setGizmoMode('off')}
      >
        <X className="size-4" />
      </ToolbarButton>
    </div>
  );
}
