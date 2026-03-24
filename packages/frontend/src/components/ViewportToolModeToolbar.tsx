import { ToolbarButton } from '@motionlab/ui';
import { Crosshair, Link2, MousePointer2 } from 'lucide-react';

import { useAuthoringStatusStore } from '../stores/authoring-status.js';
import { useJointCreationStore } from '../stores/joint-creation.js';
import { useSimulationStore } from '../stores/simulation.js';
import { useToolModeStore } from '../stores/tool-mode.js';

export function ViewportToolModeToolbar() {
  const activeMode = useToolModeStore((s) => s.activeMode);
  const setMode = useToolModeStore((s) => s.setMode);
  const simState = useSimulationStore((s) => s.state);
  const isSimulating = simState === 'running' || simState === 'paused';

  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-background/80 p-0.5 backdrop-blur-sm">
      <ToolbarButton
        tooltip="Select (V)"
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
        tooltip="Create Datum (D)"
        active={activeMode === 'create-datum'}
        disabled={isSimulating}
        onClick={() => setMode('create-datum')}
      >
        <Crosshair className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        tooltip="Create Joint (J)"
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
    </div>
  );
}
