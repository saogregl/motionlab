import {
  cn,
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
  ToolbarButton,
} from '@motionlab/ui';
import {
  Compass,
  Crosshair,
  Eye,
  EyeOff,
  Globe,
  Grid3x3,
  Link2,
  Type,
  MousePointer2,
  Move,
  RotateCw,
  X,
} from 'lucide-react';

import { getSceneGraph } from '../engine/connection.js';
import { useAuthoringStatusStore } from '../stores/authoring-status.js';
import { useJointCreationStore } from '../stores/joint-creation.js';
import { useSimulationStore } from '../stores/simulation.js';
import { useToolModeStore } from '../stores/tool-mode.js';

const TRANSLATION_PRESETS = [
  { label: '1mm', value: 0.001 },
  { label: '5mm', value: 0.005 },
  { label: '10mm', value: 0.01 },
  { label: '50mm', value: 0.05 },
  { label: '100mm', value: 0.1 },
] as const;

const ROTATION_PRESETS = [
  { label: '5\u00B0', value: Math.PI / 36 },
  { label: '15\u00B0', value: Math.PI / 12 },
  { label: '45\u00B0', value: Math.PI / 4 },
  { label: '90\u00B0', value: Math.PI / 2 },
] as const;

export function ViewportToolModeToolbar() {
  const activeMode = useToolModeStore((s) => s.activeMode);
  const gizmoMode = useToolModeStore((s) => s.gizmoMode);
  const setMode = useToolModeStore((s) => s.setMode);
  const setGizmoMode = useToolModeStore((s) => s.setGizmoMode);
  const translationSnap = useToolModeStore((s) => s.translationSnap);
  const rotationSnap = useToolModeStore((s) => s.rotationSnap);
  const setTranslationSnap = useToolModeStore((s) => s.setTranslationSnap);
  const setRotationSnap = useToolModeStore((s) => s.setRotationSnap);
  const gizmoSpace = useToolModeStore((s) => s.gizmoSpace);
  const setGizmoSpace = useToolModeStore((s) => s.setGizmoSpace);
  const datumsVisible = useToolModeStore((s) => s.datumsVisible);
  const jointsVisible = useToolModeStore((s) => s.jointsVisible);
  const gridVisible = useToolModeStore((s) => s.gridVisible);
  const setDatumsVisible = useToolModeStore((s) => s.setDatumsVisible);
  const setJointsVisible = useToolModeStore((s) => s.setJointsVisible);
  const setGridVisible = useToolModeStore((s) => s.setGridVisible);
  const labelsVisible = useToolModeStore((s) => s.labelsVisible);
  const setLabelsVisible = useToolModeStore((s) => s.setLabelsVisible);
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

      {/* Separator */}
      <div className="mx-0.5 h-px bg-[var(--border-default)]" />

      {/* Snap configuration */}
      <Popover>
        <PopoverTrigger
          render={
            <ToolbarButton tooltip="Snap Settings (hold Shift to snap)">
              <Grid3x3 className="size-4" />
            </ToolbarButton>
          }
        />
        <PopoverContent side="right" sideOffset={8} className="w-48">
          <PopoverTitle>Snap Settings</PopoverTitle>
          <div className="flex flex-col gap-2">
            <div>
              <div className="mb-1 text-[length:var(--text-xs)] text-muted-foreground">
                Translation
              </div>
              <div className="flex flex-wrap gap-1">
                {TRANSLATION_PRESETS.map(({ label, value }) => (
                  <button
                    key={value}
                    className={cn(
                      'rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[length:var(--text-xs)] transition-colors',
                      translationSnap === value
                        ? 'bg-accent text-accent-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-accent/50',
                    )}
                    onClick={() => setTranslationSnap(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[length:var(--text-xs)] text-muted-foreground">
                Rotation
              </div>
              <div className="flex flex-wrap gap-1">
                {ROTATION_PRESETS.map(({ label, value }) => (
                  <button
                    key={value}
                    className={cn(
                      'rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[length:var(--text-xs)] transition-colors',
                      Math.abs(rotationSnap - value) < 0.001
                        ? 'bg-accent text-accent-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-accent/50',
                    )}
                    onClick={() => setRotationSnap(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Local/World frame toggle */}
      <ToolbarButton
        tooltip={gizmoSpace === 'world' ? 'World Frame' : 'Local Frame'}
        shortcut="X"
        active={false}
        onClick={() => setGizmoSpace(gizmoSpace === 'world' ? 'local' : 'world')}
      >
        {gizmoSpace === 'world' ? <Globe className="size-4" /> : <Compass className="size-4" />}
      </ToolbarButton>

      {/* Separator */}
      <div className="mx-0.5 h-px bg-[var(--border-default)]" />

      {/* Display toggles */}
      <ToolbarButton
        tooltip={datumsVisible ? 'Hide Datums' : 'Show Datums'}
        active={datumsVisible}
        onClick={() => {
          const sg = getSceneGraph();
          sg?.toggleDatums();
          setDatumsVisible(!datumsVisible);
        }}
      >
        <Crosshair className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        tooltip={jointsVisible ? 'Hide Joints' : 'Show Joints'}
        active={jointsVisible}
        onClick={() => {
          const sg = getSceneGraph();
          sg?.toggleJointAnchors();
          setJointsVisible(!jointsVisible);
        }}
      >
        <Link2 className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        tooltip={gridVisible ? 'Hide Grid' : 'Show Grid'}
        active={gridVisible}
        onClick={() => {
          const sg = getSceneGraph();
          sg?.toggleGrid();
          setGridVisible(!gridVisible);
        }}
      >
        <Grid3x3 className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        tooltip={labelsVisible ? 'Hide Labels' : 'Show Labels'}
        active={labelsVisible}
        onClick={() => {
          const sg = getSceneGraph();
          sg?.toggleLabels();
          setLabelsVisible(!labelsVisible);
        }}
      >
        <Type className="size-4" />
      </ToolbarButton>
    </div>
  );
}
