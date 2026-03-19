import { SimulationAction } from '@motionlab/protocol';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@motionlab/ui';
import { useCallback, useEffect, useState } from 'react';

import {
  sendCompileMechanism,
  sendImportAsset,
  sendSimulationControl,
} from '../engine/connection.js';
import { useEngineConnection } from '../stores/engine-connection.js';
import { useJointCreationStore } from '../stores/joint-creation.js';
import { useSimulationStore } from '../stores/simulation.js';
import { useToolModeStore } from '../stores/tool-mode.js';

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const engineStatus = useEngineConnection((s) => s.status);
  const simState = useSimulationStore((s) => s.state);

  // Ctrl/Cmd+K to open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const runAndClose = useCallback((fn: () => void) => {
    fn();
    setOpen(false);
  }, []);

  const isReady = engineStatus === 'ready';
  const canCompile = isReady && (simState === 'idle' || simState === 'error');
  const canPlay = isReady && simState === 'paused';
  const canReset =
    isReady && (simState === 'running' || simState === 'paused' || simState === 'error');
  const isSimulating = simState === 'running' || simState === 'paused';

  const handleImport = useCallback(async () => {
    if (!window.motionlab?.openFileDialog) return;
    const filePath = await window.motionlab.openFileDialog({
      filters: [
        { name: 'CAD Files', extensions: ['step', 'stp', 'iges', 'igs'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (filePath) sendImportAsset(filePath);
    setOpen(false);
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Authoring">
          <CommandItem
            disabled={isSimulating}
            onSelect={() => runAndClose(() => useToolModeStore.getState().setMode('create-datum'))}
          >
            Create Datum
          </CommandItem>
          <CommandItem
            disabled={isSimulating}
            onSelect={() =>
              runAndClose(() => {
                useToolModeStore.getState().setMode('create-joint');
                useJointCreationStore.getState().startCreation();
              })
            }
          >
            Create Joint
          </CommandItem>
          <CommandItem disabled={!isReady} onSelect={handleImport}>
            Import CAD File
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Simulation">
          <CommandItem
            disabled={!canCompile}
            onSelect={() => runAndClose(() => sendCompileMechanism())}
          >
            Compile Mechanism
          </CommandItem>
          <CommandItem
            disabled={!canPlay}
            onSelect={() => runAndClose(() => sendSimulationControl(SimulationAction.PLAY))}
          >
            Run Simulation
          </CommandItem>
          <CommandItem
            disabled={!canReset}
            onSelect={() => runAndClose(() => sendSimulationControl(SimulationAction.RESET))}
          >
            Reset Simulation
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="View">
          <CommandItem
            onSelect={() => runAndClose(() => useToolModeStore.getState().setMode('select'))}
          >
            Select Mode
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
