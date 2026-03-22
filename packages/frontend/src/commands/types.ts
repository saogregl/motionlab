import type { LucideIcon } from 'lucide-react';

export interface CommandDef {
  /** Stable identifier, e.g. 'authoring.create-datum'. Used as React key. */
  id: string;
  /** Display label shown in the palette. */
  label: string;
  /** Lucide icon component, rendered to the left of the label. */
  icon?: LucideIcon;
  /** Keyboard shortcut hint string, e.g. 'Ctrl+S'. Display-only. */
  shortcut?: string;
  /** When true, the item is grayed out and unselectable. */
  disabled?: boolean;
  /** Called when the user selects this command. May be async (e.g. file dialog). */
  action: () => void | Promise<void>;
}

export interface CommandGroup {
  id: string;
  heading: string;
  commands: CommandDef[];
}
