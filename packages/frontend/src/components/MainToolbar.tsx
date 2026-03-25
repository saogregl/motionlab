import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  ToolbarButton,
  ToolbarGroup,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@motionlab/ui';
import {
  Eye,
  Fullscreen,
  Grid3x3,
  Maximize,
  Pause,
  Play,
  Redo2,
  RotateCcw,
  Square,
  StepForward,
  Undo2,
} from 'lucide-react';

import { executeCommand } from '../commands/registry.js';
import { useCommand } from '../commands/use-commands.js';
import { useSimulationStore } from '../stores/simulation.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Shorthand for reading a command's disabled state. */
function useCmdDisabled(id: string): boolean {
  const cmd = useCommand(id);
  return cmd?.disabled ?? true;
}

// ---------------------------------------------------------------------------
// MainToolbar — centered floating bar
// ---------------------------------------------------------------------------

export function MainToolbar() {
  const undoDisabled = useCmdDisabled('edit.undo');
  const redoDisabled = useCmdDisabled('edit.redo');

  const simState = useSimulationStore((s) => s.state);
  const errorMessage = useSimulationStore((s) => s.errorMessage);

  const playDisabled = useCmdDisabled('sim.play');
  const pauseDisabled = useCmdDisabled('sim.pause');
  const stepDisabled = useCmdDisabled('sim.step');
  const resetDisabled = useCmdDisabled('sim.reset');

  return (
    <div
      data-slot="main-toolbar"
      className="pointer-events-auto absolute top-[var(--panel-float-inset)] left-1/2 -translate-x-1/2 z-[var(--z-toolbar)] flex h-[var(--toolbar-h)] w-fit items-center gap-0.5 rounded-[var(--panel-radius)] border border-[var(--border-default)] bg-layer-base ps-1.5 pe-1.5"
    >
      {/* ── Simulation controls ── */}
      <ToolbarGroup separator>
        {simState === 'running' ? (
          <ToolbarButton
            tooltip="Pause"
            shortcut="Space"
            disabled={pauseDisabled}
            onClick={() => executeCommand('sim.pause')}
          >
            <Pause className="size-4" />
          </ToolbarButton>
        ) : (
          <ToolbarButton
            tooltip="Play"
            shortcut="Space"
            disabled={playDisabled}
            onClick={() => executeCommand('sim.play')}
          >
            <Play className="size-4" />
          </ToolbarButton>
        )}

        <ToolbarButton
          tooltip="Step"
          shortcut="."
          disabled={stepDisabled}
          onClick={() => executeCommand('sim.step')}
        >
          <StepForward className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          tooltip="Reset"
          shortcut="R"
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
      </ToolbarGroup>

      {/* ── View Dropdown ── */}
      <ToolbarGroup separator>
        <ViewDropdown />
      </ToolbarGroup>

      {/* ── Undo / Redo ── */}
      <ToolbarGroup>
        <ToolbarButton tooltip="Undo" shortcut="Ctrl+Z" disabled={undoDisabled}>
          <Undo2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton tooltip="Redo" shortcut="Ctrl+Shift+Z" disabled={redoDisabled}>
          <Redo2 className="size-4" />
        </ToolbarButton>
      </ToolbarGroup>
    </div>
  );
}

// ---------------------------------------------------------------------------
// View Dropdown (extracted for readability)
// ---------------------------------------------------------------------------

export function ViewDropdown() {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={<DropdownMenuTrigger render={<Button variant="toolbar" size="icon" />} />}
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
