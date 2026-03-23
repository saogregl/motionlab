import { useEngineConnection } from '../stores/engine-connection.js';
import { useSelectionStore } from '../stores/selection.js';
import { useSimulationStore } from '../stores/simulation.js';
import { useToolModeStore } from '../stores/tool-mode.js';
import { getAllCommands, getCommand, getCommandsByCategory } from './registry.js';
import type { CommandCategory, CommandDef, CommandGroup } from './types.js';

/**
 * Category display names for headings.
 */
const CATEGORY_HEADINGS: Record<CommandCategory, string> = {
  file: 'File',
  edit: 'Edit',
  create: 'Create',
  simulate: 'Simulation',
  view: 'View',
  help: 'Help',
};

/** Category ordering for consistent display. */
const CATEGORY_ORDER: CommandCategory[] = ['file', 'edit', 'create', 'simulate', 'view', 'help'];

/**
 * Subscribe to all stores that affect command enabled/disabled state.
 * This triggers re-renders when any relevant state changes.
 */
function useCommandStateSubscriptions() {
  useEngineConnection((s) => s.status);
  useSimulationStore((s) => s.state);
  useSelectionStore((s) => s.selectedIds);
  useToolModeStore((s) => s.activeMode);
}

/**
 * React hook that provides all commands grouped by category with reactive disabled state.
 */
export function useCommandGroups(): CommandGroup[] {
  useCommandStateSubscriptions();

  const all = getAllCommands();
  const groups: CommandGroup[] = [];

  for (const category of CATEGORY_ORDER) {
    const cmds = all.filter((c) => c.category === category);
    if (cmds.length === 0) continue;

    groups.push({
      id: category,
      heading: CATEGORY_HEADINGS[category],
      commands: cmds,
    });
  }

  return groups;
}

/**
 * React hook that returns commands for a specific category with reactive state.
 */
export function useCommandsByCategory(category: CommandCategory): CommandDef[] {
  useCommandStateSubscriptions();
  return getCommandsByCategory(category);
}

/**
 * React hook that returns a single command with a computed `disabled` boolean.
 */
export function useCommand(id: string): (CommandDef & { disabled: boolean }) | undefined {
  useCommandStateSubscriptions();
  const cmd = getCommand(id);
  if (!cmd) return undefined;
  const disabled = cmd.enabled ? !cmd.enabled() : false;
  return { ...cmd, disabled };
}
