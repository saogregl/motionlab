import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@motionlab/ui';

import { getAllCommands } from '../commands/registry.js';
import type { CommandCategory } from '../commands/types.js';

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

const CATEGORY_ORDER: CommandCategory[] = ['file', 'edit', 'create', 'simulate', 'view', 'help'];

const CATEGORY_HEADINGS: Record<CommandCategory, string> = {
  file: 'File',
  edit: 'Edit',
  create: 'Create',
  simulate: 'Simulation',
  view: 'View',
  help: 'Help',
};

function getShortcutGroups() {
  const cmds = getAllCommands().filter((cmd) => cmd.shortcut);

  // Deduplicate by shortcut string (keep first occurrence)
  const seen = new Set<string>();
  const unique = cmds.filter((cmd) => {
    if (seen.has(cmd.shortcut!)) return false;
    seen.add(cmd.shortcut!);
    return true;
  });

  const grouped = new Map<CommandCategory, typeof unique>();
  for (const cmd of unique) {
    const list = grouped.get(cmd.category) ?? [];
    list.push(cmd);
    grouped.set(cmd.category, list);
  }
  return grouped;
}

export function KeyboardShortcutsDialog({ open, onClose }: KeyboardShortcutsDialogProps) {
  const grouped = open ? getShortcutGroups() : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          {grouped &&
            CATEGORY_ORDER.map((cat) => {
              const cmds = grouped.get(cat);
              if (!cmds || cmds.length === 0) return null;
              return (
                <div key={cat}>
                  <h4 className="text-xs font-medium text-text-secondary mb-1 px-1">
                    {CATEGORY_HEADINGS[cat]}
                  </h4>
                  {cmds.map((cmd) => (
                    <div key={cmd.id} className="flex items-center justify-between px-1 py-1.5">
                      <span className="text-xs text-text-secondary">{cmd.label}</span>
                      <kbd className="rounded border border-border bg-layer-elevated px-1.5 py-0.5 font-mono text-2xs text-text-primary">
                        {cmd.shortcut}
                      </kbd>
                    </div>
                  ))}
                </div>
              );
            })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
