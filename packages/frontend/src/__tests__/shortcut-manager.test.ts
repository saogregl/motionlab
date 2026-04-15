import { afterEach, describe, expect, it } from 'vitest';

import { clearRegistry, registerCommands } from '../commands/registry.js';
import {
  buildShortcutMapForCommands,
  parseShortcut,
  rebuildShortcutMap,
  resolveShortcutCommand,
} from '../commands/shortcut-manager.js';
import type { CommandDef } from '../commands/types.js';

function shortcutEvent(overrides?: Partial<Parameters<typeof resolveShortcutCommand>[0]>) {
  return {
    altKey: false,
    code: '',
    ctrlKey: false,
    key: '',
    metaKey: false,
    shiftKey: false,
    target: null,
    ...overrides,
  };
}

afterEach(() => {
  clearRegistry();
  rebuildShortcutMap();
});

describe('Shortcut manager', () => {
  describe('parseShortcut', () => {
    it('parses single letter key', () => {
      const parsed = parseShortcut('F');
      expect(parsed).toEqual({ ctrl: false, shift: false, alt: false, key: 'f' });
    });

    it('parses Ctrl+key', () => {
      const parsed = parseShortcut('Ctrl+A');
      expect(parsed).toEqual({ ctrl: true, shift: false, alt: false, key: 'a' });
    });

    it('parses Ctrl+Shift+key', () => {
      const parsed = parseShortcut('Ctrl+Shift+Z');
      expect(parsed).toEqual({ ctrl: true, shift: true, alt: false, key: 'z' });
    });

    it('parses Delete alias', () => {
      const parsed = parseShortcut('Delete');
      expect(parsed).toEqual({ ctrl: false, shift: false, alt: false, key: 'Delete' });
    });

    it('parses Backspace alias', () => {
      const parsed = parseShortcut('Backspace');
      expect(parsed).toEqual({ ctrl: false, shift: false, alt: false, key: 'Backspace' });
    });

    it('parses Escape alias', () => {
      const parsed = parseShortcut('Escape');
      expect(parsed).toEqual({ ctrl: false, shift: false, alt: false, key: 'Escape' });
    });

    it('parses Space alias', () => {
      const parsed = parseShortcut('Space');
      expect(parsed).toEqual({ ctrl: false, shift: false, alt: false, key: ' ' });
    });

    it('treats Cmd as Ctrl', () => {
      const parsed = parseShortcut('Cmd+S');
      expect(parsed.ctrl).toBe(true);
    });
  });

  describe('resolveShortcutCommand', () => {
    it('picks the first enabled command for duplicate shortcuts', () => {
      const commands: CommandDef[] = [
        {
          id: 'sim.play',
          label: 'Play',
          category: 'simulate',
          shortcut: 'Space',
          enabled: () => false,
          execute: () => {},
        },
        {
          id: 'sim.pause',
          label: 'Pause',
          category: 'simulate',
          shortcut: 'Space',
          enabled: () => true,
          execute: () => {},
        },
      ];

      registerCommands(commands);
      rebuildShortcutMap();

      expect(resolveShortcutCommand(shortcutEvent({ key: ' ', code: 'Space' }))).toBe('sim.pause');
      expect(buildShortcutMapForCommands(commands).get(' ')?.length).toBe(2);
    });

    it('suppresses plain-key shortcuts when an input is focused', () => {
      registerCommands([
        {
          id: 'create.datum',
          label: 'Create Datum',
          category: 'create',
          shortcut: 'D',
          execute: () => {},
        },
      ]);
      rebuildShortcutMap();

      expect(
        resolveShortcutCommand(
          shortcutEvent({
            key: 'd',
            code: 'KeyD',
            target: { tagName: 'INPUT' } as unknown as EventTarget,
          }),
        ),
      ).toBeUndefined();
    });

    it('does not intercept Ctrl+A inside an input', () => {
      registerCommands([
        {
          id: 'edit.select-all',
          label: 'Select All',
          category: 'edit',
          shortcut: 'Ctrl+A',
          execute: () => {},
        },
      ]);
      rebuildShortcutMap();

      expect(
        resolveShortcutCommand(
          shortcutEvent({
            ctrlKey: true,
            key: 'a',
            code: 'KeyA',
            target: { tagName: 'INPUT' } as unknown as EventTarget,
          }),
        ),
      ).toBeUndefined();
    });
  });
});
