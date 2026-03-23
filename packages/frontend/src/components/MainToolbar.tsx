import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  SecondaryToolbar,
  ToolbarButton,
  ToolbarGroup,
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@motionlab/ui';
import {
  Activity,
  ArrowUpDown,
  Box,
  Cpu,
  Crosshair,
  Cylinder,
  Circle,
  Eye,
  Fullscreen,
  Gauge,
  Grid3x3,
  Import,
  Link2,
  Lock,
  Maximize,
  MousePointer2,
  MoveHorizontal,
  Pause,
  Play,
  Radio,
  Redo2,
  RotateCcw,
  RotateCw,
  Square,
  StepForward,
  Undo2,
  Zap,
} from 'lucide-react';

import { executeCommand } from '../commands/registry.js';
import { useCommand } from '../commands/use-commands.js';
import { useSimulationStore } from '../stores/simulation.js';
import { useToolModeStore } from '../stores/tool-mode.js';
import { ToolbarSplitButton } from './toolbar/ToolbarSplitButton.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Shorthand for reading a command's disabled state. */
function useCmdDisabled(id: string): boolean {
  const cmd = useCommand(id);
  return cmd?.disabled ?? true;
}

// ---------------------------------------------------------------------------
// MainToolbar
// ---------------------------------------------------------------------------

export function MainToolbar() {
  const activeMode = useToolModeStore((s) => s.activeMode);
  const simState = useSimulationStore((s) => s.state);
  const simTime = useSimulationStore((s) => s.simTime);
  const errorMessage = useSimulationStore((s) => s.errorMessage);

  // Sim button disabled states
  const compileDisabled = useCmdDisabled('sim.compile');
  const playDisabled = useCmdDisabled('sim.play');
  const pauseDisabled = useCmdDisabled('sim.pause');
  const stepDisabled = useCmdDisabled('sim.step');
  const resetDisabled = useCmdDisabled('sim.reset');
  const createBodyDisabled = useCmdDisabled('create.body');
  const importDisabled = useCmdDisabled('create.import');
  const datumDisabled = useCmdDisabled('create.datum');
  const jointDisabled = useCmdDisabled('create.joint');
  const forceDisabled = useCmdDisabled('create.force.point');
  const undoDisabled = useCmdDisabled('edit.undo');
  const redoDisabled = useCmdDisabled('edit.redo');

  return (
    <SecondaryToolbar className="overflow-hidden min-w-0">
      {/* ── Group 1: Mode & Basic Creation ── */}
      <ToolbarGroup separator>
        <ToolbarButton
          tooltip="Select" shortcut="V"
          active={activeMode === 'select'}
          onClick={() => executeCommand('view.select-mode')}
        >
          <MousePointer2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          tooltip="Create Body" shortcut="B"
          disabled={createBodyDisabled}
          onClick={() => executeCommand('create.body')}
        >
          <Box className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          tooltip="Import Geometry"
          disabled={importDisabled}
          onClick={() => executeCommand('create.import')}
        >
          <Import className="size-4" />
        </ToolbarButton>
      </ToolbarGroup>

      {/* ── Group 2: Entity Creation Dropdowns ── */}
      <ToolbarGroup separator>
        {/* Datum split button */}
        <ToolbarSplitButton
          tooltip="Create Datum" shortcut="D"
          icon={Crosshair}
          active={activeMode === 'create-datum'}
          mainDisabled={datumDisabled}
          menuDisabled={false}
          onClickMain={() => executeCommand('create.datum')}
        >
          <DropdownMenuItem onSelect={() => executeCommand('create.datum.from-face')}>
            <Crosshair className="size-4" />
            From Face
            <DropdownMenuShortcut>D</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled>
            <Crosshair className="size-4" />
            Point
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <Crosshair className="size-4" />
            Axis
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <Crosshair className="size-4" />
            Plane
          </DropdownMenuItem>
        </ToolbarSplitButton>

        {/* Joint split button */}
        <ToolbarSplitButton
          tooltip="Create Joint" shortcut="J"
          icon={Link2}
          active={activeMode === 'create-joint'}
          mainDisabled={jointDisabled}
          menuDisabled={false}
          onClickMain={() => executeCommand('create.joint')}
        >
          <DropdownMenuItem onSelect={() => executeCommand('create.joint.revolute')}>
            <RotateCw className="size-4" />
            Revolute
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => executeCommand('create.joint.prismatic')}>
            <MoveHorizontal className="size-4" />
            Prismatic
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => executeCommand('create.joint.fixed')}>
            <Lock className="size-4" />
            Fixed
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled>
            <Circle className="size-4" />
            Spherical
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <Cylinder className="size-4" />
            Cylindrical
          </DropdownMenuItem>
        </ToolbarSplitButton>
      </ToolbarGroup>

      {/* ── Group 3: Force / Actuator Dropdowns ── */}
      <ToolbarGroup separator>
        <ToolbarSplitButton
          tooltip="Create Force" shortcut="L"
          icon={Zap}
          active={activeMode === 'create-load'}
          mainDisabled={forceDisabled}
          menuDisabled={false}
          onClickMain={() => executeCommand('create.force.point')}
        >
          <DropdownMenuItem onSelect={() => executeCommand('create.force.point')}>
            <Zap className="size-4" />
            Point Force
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => executeCommand('create.force.torque')}>
            <RotateCcw className="size-4" />
            Point Torque
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => executeCommand('create.force.spring-damper')}>
            <Activity className="size-4" />
            Spring-Damper
          </DropdownMenuItem>
        </ToolbarSplitButton>

        <ToolbarSplitButton
          tooltip="Actuator"
          icon={Gauge}
          mainDisabled
          menuDisabled={false}
          onClickMain={() => {}}
        >
          <DropdownMenuItem disabled>
            <Gauge className="size-4" />
            Revolute Motor
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <ArrowUpDown className="size-4" />
            Prismatic Motor
          </DropdownMenuItem>
        </ToolbarSplitButton>
      </ToolbarGroup>

      {/* ── Group 4: Simulation Controls ── */}
      <ToolbarGroup separator>
        <ToolbarButton
          tooltip="Compile Mechanism"
          disabled={compileDisabled}
          onClick={() => executeCommand('sim.compile')}
        >
          <Cpu className="size-4" />
        </ToolbarButton>

        {simState === 'running' ? (
          <ToolbarButton
            tooltip="Pause" shortcut="Space"
            disabled={pauseDisabled}
            onClick={() => executeCommand('sim.pause')}
          >
            <Pause className="size-4" />
          </ToolbarButton>
        ) : (
          <ToolbarButton
            tooltip="Play" shortcut="Space"
            disabled={playDisabled}
            onClick={() => executeCommand('sim.play')}
          >
            <Play className="size-4" />
          </ToolbarButton>
        )}

        <ToolbarButton
          tooltip="Step" shortcut="."
          disabled={stepDisabled}
          onClick={() => executeCommand('sim.step')}
        >
          <StepForward className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          tooltip="Reset" shortcut="R"
          disabled={resetDisabled}
          onClick={() => executeCommand('sim.reset')}
        >
          <RotateCcw className="size-4" />
        </ToolbarButton>

        {simState === 'compiling' && (
          <span className="ms-2 text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
            Compiling…
          </span>
        )}
        {simState === 'error' && errorMessage && (
          <span
            className="ms-2 max-w-[300px] truncate text-[length:var(--text-2xs)] text-destructive"
            title={errorMessage}
          >
            {errorMessage}
          </span>
        )}
        <span className="px-2 font-mono text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
          t&nbsp;=&nbsp;{simTime.toFixed(3)}s
        </span>
      </ToolbarGroup>

      {/* ── Group 5: View Dropdown ── */}
      <ToolbarGroup separator>
        <ViewDropdown />
      </ToolbarGroup>

      {/* ── Spacer ── */}
      <div className="flex-1" />

      {/* ── Group 6: Edit (right-aligned) ── */}
      <ToolbarGroup>
        <ToolbarButton tooltip="Undo" shortcut="Ctrl+Z" disabled={undoDisabled}>
          <Undo2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton tooltip="Redo" shortcut="Ctrl+Shift+Z" disabled={redoDisabled}>
          <Redo2 className="size-4" />
        </ToolbarButton>
      </ToolbarGroup>
    </SecondaryToolbar>
  );
}

// ---------------------------------------------------------------------------
// View Dropdown (extracted for readability)
// ---------------------------------------------------------------------------

function ViewDropdown() {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button variant="toolbar" size="icon" />
              }
            />
          }
        >
          <Eye className="size-4" />
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-[length:var(--text-xs)]">
          View
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={() => executeCommand('view.fit-all')}>
          <Maximize className="size-4" />
          Fit All
          <DropdownMenuShortcut>F</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => executeCommand('view.fit-selection')}>
          <Fullscreen className="size-4" />
          Fit to Selection
          <DropdownMenuShortcut>F</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => executeCommand('view.iso')}>
          <Square className="size-4" />
          Isometric
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => executeCommand('view.front')}>
          <Square className="size-4" />
          Front
          <DropdownMenuShortcut>1</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => executeCommand('view.back')}>
          <Square className="size-4" />
          Back
          <DropdownMenuShortcut>2</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => executeCommand('view.left')}>
          <Square className="size-4" />
          Left
          <DropdownMenuShortcut>3</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => executeCommand('view.right')}>
          <Square className="size-4" />
          Right
          <DropdownMenuShortcut>4</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => executeCommand('view.top')}>
          <Square className="size-4" />
          Top
          <DropdownMenuShortcut>5</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => executeCommand('view.bottom')}>
          <Square className="size-4" />
          Bottom
          <DropdownMenuShortcut>6</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => executeCommand('view.toggle-grid')}>
          <Grid3x3 className="size-4" />
          Toggle Grid
          <DropdownMenuShortcut>G</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
