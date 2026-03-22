import { useAuthoringCommands } from './use-authoring-commands.js';
import { useHelpCommands } from './use-help-commands.js';
import { useSettingsCommands } from './use-settings-commands.js';
import { useSimulationCommands } from './use-simulation-commands.js';
import { useViewCommands } from './use-view-commands.js';

export type { CommandDef, CommandGroup } from './types.js';

export function useAllCommandGroups() {
  return [
    useAuthoringCommands(),
    useSimulationCommands(),
    useSettingsCommands(),
    useViewCommands(),
    useHelpCommands(),
  ];
}
