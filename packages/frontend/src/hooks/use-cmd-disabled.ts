import { useCommand } from '../commands/use-commands.js';

/** Shorthand for reading a command's disabled state. */
export function useCmdDisabled(id: string): boolean {
  const cmd = useCommand(id);
  return cmd?.disabled ?? true;
}
