/**
 * Keyboard shortcut manager.
 *
 * Reads shortcut bindings from the command registry and sets up
 * a single global keydown listener that dispatches to the appropriate
 * command's execute() function.
 *
 * Handles:
 * - Modifier keys (Ctrl, Shift, Alt, Meta)
 * - Single-key shortcuts (D, J, V, etc.)
 * - Input element filtering (skip when focused on INPUT/TEXTAREA/contentEditable)
 * - Conflict detection
 * - Context-dependent shortcuts via enabled() checks (e.g., Space toggles play/pause)
 */

import { getAllCommands, getCommand } from './registry.js';
import type { CommandDef } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedShortcut {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  key: string; // lowercase e.key value ('d', ' ', 'Escape', 'Delete', '.')
  code?: string; // for code-based matching ('Numpad0')
}

interface ShortcutBinding {
  commandId: string;
  parsed: ParsedShortcut;
  hasModifier: boolean; // true if ctrl, shift, or alt is set
}

export interface ShortcutEventLike {
  altKey: boolean;
  code: string;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
  target: EventTarget | null;
}

// ---------------------------------------------------------------------------
// Shortcut string → ParsedShortcut
// ---------------------------------------------------------------------------

/** Map of named keys to their KeyboardEvent.key values. */
const KEY_ALIASES: Record<string, string> = {
  space: ' ',
  delete: 'Delete',
  backspace: 'Backspace',
  escape: 'Escape',
};

/** Keys that match on e.code instead of e.key. */
const CODE_KEYS = new Set(['numpad0']);

export function parseShortcut(str: string): ParsedShortcut {
  const parts = str.split('+').map((p) => p.trim());
  let ctrl = false;
  let shift = false;
  let alt = false;

  const keyPart = parts.filter((p) => {
    const lower = p.toLowerCase();
    if (lower === 'ctrl' || lower === 'cmd' || lower === 'meta') {
      ctrl = true;
      return false;
    }
    if (lower === 'shift') {
      shift = true;
      return false;
    }
    if (lower === 'alt') {
      alt = true;
      return false;
    }
    return true;
  });

  const raw = keyPart.join('+'); // rejoin in case of e.g. "Numpad 0" (no + split there)
  const lower = raw.toLowerCase();

  // Code-based keys (Numpad)
  if (CODE_KEYS.has(lower)) {
    // e.g. 'Numpad0' → code 'Numpad0'
    return { ctrl, shift, alt, key: '', code: raw };
  }

  // Named aliases
  const aliased = KEY_ALIASES[lower];
  if (aliased !== undefined) {
    return { ctrl, shift, alt, key: aliased };
  }

  // Single letter or symbol — lowercase for case-insensitive matching
  return { ctrl, shift, alt, key: raw.toLowerCase() };
}

// ---------------------------------------------------------------------------
// Lookup key construction
// ---------------------------------------------------------------------------

function lookupKey(
  ctrl: boolean,
  shift: boolean,
  alt: boolean,
  key: string,
  code?: string,
): string {
  if (code) return code.toLowerCase();
  const parts: string[] = [];
  if (ctrl) parts.push('ctrl');
  if (shift) parts.push('shift');
  if (alt) parts.push('alt');
  parts.push(key.toLowerCase());
  return parts.join('+');
}

function lookupKeyFromParsed(p: ParsedShortcut): string {
  return lookupKey(p.ctrl, p.shift, p.alt, p.key, p.code);
}

function lookupKeyFromEvent(e: KeyboardEvent): string[] {
  const ctrl = e.ctrlKey || e.metaKey;
  const keys: string[] = [];

  // Try code-based match first (for Numpad keys)
  if (e.code.startsWith('Numpad')) {
    keys.push(e.code.toLowerCase());
  }

  // Standard key-based match
  keys.push(lookupKey(ctrl, e.shiftKey, e.altKey, e.key));

  return keys;
}

// ---------------------------------------------------------------------------
// Shortcut map
// ---------------------------------------------------------------------------

/** Command IDs excluded from shortcut binding (handled by their own listeners). */
const EXCLUDED_COMMANDS = new Set(['help.command-palette']);

let shortcutMap = new Map<string, ShortcutBinding[]>();

export function buildShortcutMapForCommands(
  commands: CommandDef[],
): Map<string, ShortcutBinding[]> {
  const map = new Map<string, ShortcutBinding[]>();
  const seen = new Map<string, string>(); // lookupKey → first commandId (for conflict warnings)

  for (const cmd of commands) {
    if (!cmd.shortcut || EXCLUDED_COMMANDS.has(cmd.id)) continue;

    // Support comma-separated shortcuts, e.g. 'Delete, Backspace'
    const shortcuts = cmd.shortcut.split(',').map((s) => s.trim());
    for (const shortcutStr of shortcuts) {
      const parsed = parseShortcut(shortcutStr);
      const lk = lookupKeyFromParsed(parsed);
      const hasModifier = parsed.ctrl || parsed.shift || parsed.alt;
      const binding: ShortcutBinding = { commandId: cmd.id, parsed, hasModifier };

      const existing = map.get(lk);
      if (existing) {
        const firstId = seen.get(lk);
        if (firstId !== cmd.id) {
          console.warn(`Shortcut '${shortcutStr}' bound to both '${firstId}' and '${cmd.id}'`);
        }
        existing.push(binding);
      } else {
        map.set(lk, [binding]);
        seen.set(lk, cmd.id);
      }
    }
  }

  return map;
}

function buildShortcutMap(): void {
  shortcutMap = buildShortcutMapForCommands(getAllCommands());
}

export function rebuildShortcutMap(): void {
  buildShortcutMap();
}

// ---------------------------------------------------------------------------
// Input filtering
// ---------------------------------------------------------------------------

function isInputFocused(e: ShortcutEventLike): boolean {
  const el = e.target as HTMLElement | null;
  const tag = el?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable === true;
}

// ---------------------------------------------------------------------------
// Global handler
// ---------------------------------------------------------------------------

export function resolveShortcutCommand(event: ShortcutEventLike): string | undefined {
  const lookupKeys = lookupKeyFromEvent(event as KeyboardEvent);

  let bindings: ShortcutBinding[] | undefined;
  for (const lk of lookupKeys) {
    bindings = shortcutMap.get(lk);
    if (bindings) break;
  }
  if (!bindings || bindings.length === 0) return undefined;

  // Non-modifier shortcuts are suppressed when an input element is focused
  if (!bindings[0].hasModifier && isInputFocused(event)) return undefined;

  // Standard text-editing shortcuts (Ctrl+A) should not be intercepted in inputs
  if (
    isInputFocused(event) &&
    (event.ctrlKey || event.metaKey) &&
    (event.key === 'a' || event.key === 'A')
  ) {
    return undefined;
  }

  // Try each binding in registration order; execute the first enabled one
  for (const binding of bindings) {
    const cmd = getCommand(binding.commandId);
    if (!cmd) continue;
    if (cmd.enabled && !cmd.enabled()) continue;
    return cmd.id;
  }

  return undefined;
}

function handleKeyDown(e: KeyboardEvent): void {
  const commandId = resolveShortcutCommand(e);
  if (!commandId) return;

  e.preventDefault();
  getCommand(commandId)?.execute();
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function initShortcutManager(): () => void {
  buildShortcutMap();
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}
