import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@motionlab/ui';
import { Fragment, useCallback, useEffect } from 'react';
import type { CommandDef } from '../commands/types.js';
import { useCommandGroups } from '../commands/use-commands.js';
import { useCommandPaletteStore } from '../stores/command-palette.js';

export function CommandPalette() {
  const groups = useCommandGroups();
  const isOpen = useCommandPaletteStore((s) => s.isOpen);
  const setOpen = useCommandPaletteStore((s) => s.setOpen);

  // Ctrl/Cmd+K to toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        useCommandPaletteStore.getState().togglePalette();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const runCommand = useCallback((command: CommandDef) => {
    command.execute();
    if (command.id === 'help.command-palette') return;
    useCommandPaletteStore.getState().closePalette();
  }, []);

  return (
    <CommandDialog open={isOpen} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {groups.map((group, i) => (
          <Fragment key={group.id}>
            {i > 0 && <CommandSeparator />}
            <CommandGroup heading={group.heading}>
              {group.commands.map((cmd) => {
                const disabled = cmd.enabled ? !cmd.enabled() : false;
                return (
                  <CommandItem key={cmd.id} disabled={disabled} onSelect={() => runCommand(cmd)}>
                    {cmd.icon && <cmd.icon className="size-5" />}
                    {cmd.label}
                    {cmd.shortcut && <CommandShortcut>{cmd.shortcut}</CommandShortcut>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </Fragment>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
