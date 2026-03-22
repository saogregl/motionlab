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
import { Fragment, useCallback, useEffect, useState } from 'react';

import { useAllCommandGroups } from '../commands/index.js';

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const groups = useAllCommandGroups();

  // Ctrl/Cmd+K to toggle
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

  const runAndClose = useCallback((fn: () => void | Promise<void>) => {
    fn();
    setOpen(false);
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {groups.map((group, i) => (
          <Fragment key={group.id}>
            {i > 0 && <CommandSeparator />}
            <CommandGroup heading={group.heading}>
              {group.commands.map((cmd) => (
                <CommandItem
                  key={cmd.id}
                  disabled={cmd.disabled}
                  onSelect={() => runAndClose(cmd.action)}
                >
                  {cmd.icon && <cmd.icon className="size-5" />}
                  {cmd.label}
                  {cmd.shortcut && <CommandShortcut>{cmd.shortcut}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          </Fragment>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
