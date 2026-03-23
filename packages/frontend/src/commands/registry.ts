/**
 * Central command registry.
 *
 * Plain TypeScript module — no React dependency.
 * Commands register themselves at app startup via initCommands().
 * React hooks subscribe to the registry for dynamic enable/disable.
 */

import type { CommandCategory, CommandDef } from './types.js';

const commands = new Map<string, CommandDef>();

export function registerCommand(cmd: CommandDef): void {
  if (commands.has(cmd.id)) {
    console.warn(`Command "${cmd.id}" already registered, overwriting.`);
  }
  commands.set(cmd.id, cmd);
}

export function registerCommands(cmds: CommandDef[]): void {
  for (const cmd of cmds) registerCommand(cmd);
}

export function getCommand(id: string): CommandDef | undefined {
  return commands.get(id);
}

export function getAllCommands(): CommandDef[] {
  return Array.from(commands.values());
}

export function getCommandsByCategory(category: CommandCategory): CommandDef[] {
  return getAllCommands().filter((c) => c.category === category);
}

export function executeCommand(id: string): void {
  const cmd = commands.get(id);
  if (!cmd) {
    console.warn(`Command "${id}" not found.`);
    return;
  }
  if (cmd.enabled && !cmd.enabled()) {
    console.warn(`Command "${id}" is disabled.`);
    return;
  }
  cmd.execute();
}

/** Clear all commands. Useful for testing. */
export function clearRegistry(): void {
  commands.clear();
}
