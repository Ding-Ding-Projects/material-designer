import { describe, expect, it } from 'vitest';

import {
  ariaKeyShortcuts,
  formatShortcut,
  matchesShortcut,
} from '../../src/components/shortcuts/registry';

const windowsPaletteEvent = {
  key: 'f',
  metaKey: false,
  ctrlKey: true,
  shiftKey: true,
  altKey: false,
};

const macPaletteEvent = {
  key: 'F',
  metaKey: true,
  ctrlKey: false,
  shiftKey: true,
  altKey: false,
};

describe('shortcut registry — command palette', () => {
  it('matches the advertised chord on Windows and macOS', () => {
    expect(matchesShortcut('commandPalette.open', windowsPaletteEvent, { mac: false })).toBe(true);
    expect(matchesShortcut('commandPalette.open', macPaletteEvent, { mac: true })).toBe(true);
  });

  it('rejects the retired palette chords', () => {
    expect(
      matchesShortcut(
        'commandPalette.open',
        { ...windowsPaletteEvent, key: 'k', shiftKey: false },
        { mac: false },
      ),
    ).toBe(false);
    expect(
      matchesShortcut('commandPalette.open', { ...windowsPaletteEvent, key: 'p' }, { mac: false }),
    ).toBe(false);
  });

  it('formats the same binding for keycaps and assistive technology', () => {
    expect(formatShortcut('commandPalette.open', { mac: false })).toBe('Ctrl+Shift+F');
    expect(ariaKeyShortcuts('commandPalette.open', { mac: false })).toBe('Control+Shift+F');
    expect(formatShortcut('commandPalette.open', { mac: true })).toBe('⇧⌘F');
    expect(ariaKeyShortcuts('commandPalette.open', { mac: true })).toBe('Meta+Shift+F');
  });
});
