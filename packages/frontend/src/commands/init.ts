import { createCreateCommands } from './definitions/create-commands.js';
import { createEditCommands } from './definitions/edit-commands.js';
import { createFileCommands } from './definitions/file-commands.js';
import { createHelpCommands } from './definitions/help-commands.js';
import { createSimulateCommands } from './definitions/simulate-commands.js';
import { createViewCommands } from './definitions/view-commands.js';
import { registerCommands } from './registry.js';

let initialized = false;

export function initCommands(): void {
  if (initialized) return;
  registerCommands([
    ...createFileCommands(),
    ...createEditCommands(),
    ...createCreateCommands(),
    ...createSimulateCommands(),
    ...createViewCommands(),
    ...createHelpCommands(),
  ]);
  initialized = true;
}
