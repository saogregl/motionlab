import type { LucideIcon } from 'lucide-react';

export type CommandCategory = 'file' | 'edit' | 'create' | 'simulate' | 'view' | 'help';

export interface CommandDef {
  /** Stable identifier using dot-notation, e.g. 'create.datum', 'sim.play'. */
  id: string;
  /** Display label shown in toolbar, palette, and menus. */
  label: string;
  /** Lucide icon component. */
  icon?: LucideIcon;
  /** Category for grouping in toolbar and palette. */
  category: CommandCategory;
  /**
   * Keyboard shortcut definition.
   * Format: modifier keys joined with '+', e.g. 'Ctrl+S', 'Ctrl+Shift+Z', 'D', 'Space'.
   * Used for both display and actual binding.
   */
  shortcut?: string;
  /**
   * Returns whether the command is currently executable.
   * Called imperatively (reads store state via .getState()).
   * If omitted, command is always enabled.
   */
  enabled?: () => boolean;
  /** Execute the command. May be async. */
  execute: () => void | Promise<void>;
}

export interface CommandGroup {
  id: string;
  heading: string;
  commands: CommandDef[];
}
