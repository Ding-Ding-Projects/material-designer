// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  EntryTopbarSearch,
  paletteShortcutAria,
  paletteShortcutLabel,
} from '../../src/components/EntryTopbarSearch';
import {
  clearPendingCommandPalette,
  peekPendingCommandPalette,
} from '../../src/components/command-palette/open';
import { en } from '../../src/i18n/locales/en';

// Rendered without an `I18nProvider`: `useT` falls back to the standalone
// English translator, which is what lets these assertions name real copy.

const FIELD = 'entry-topbar-search-field';

function openBuilder() {
  fireEvent.click(screen.getByTestId(`${FIELD}-regex-toggle`));
  return screen.getByTestId(`${FIELD}-regex-popover`);
}

function enableRegex() {
  const popover = openBuilder();
  fireEvent.click(within(popover).getByTestId(`${FIELD}-regex-mode-regex`));
  return popover;
}

beforeEach(() => {
  clearPendingCommandPalette();
});

afterEach(() => {
  cleanup();
  clearPendingCommandPalette();
});

describe('EntryTopbarSearch — the field itself', () => {
  it('is a named, typeable search field carrying the mockup placeholder', () => {
    render(<EntryTopbarSearch />);
    const input = screen.getByTestId(FIELD) as HTMLInputElement;
    expect(input.getAttribute('placeholder')).toBe(en['entrySearch.placeholder']);
    expect(input.getAttribute('aria-label')).toBe(en['entrySearch.aria']);
    expect(input.getAttribute('type')).toBe('search');
  });

  it('carries its own regex affordance, closed until it is used', () => {
    render(<EntryTopbarSearch />);
    expect(screen.queryByTestId(`${FIELD}-regex-popover`)).toBeNull();
    expect(screen.getByTestId(`${FIELD}-regex-toggle`).getAttribute('aria-expanded')).toBe(
      'false',
    );
    openBuilder();
    expect(screen.getByTestId(`${FIELD}-regex-popover`).getAttribute('role')).toBe('dialog');
  });

  it('starts in plain text, because regex is always an explicit opt-in', () => {
    render(<EntryTopbarSearch />);
    expect(screen.getByTestId(FIELD).getAttribute('data-regex-mode')).toBe('text');
  });

  it('names the palette shortcut for a screen reader as well as on the chip', () => {
    render(<EntryTopbarSearch />);
    const chip = screen.getByTestId('entry-topbar-search-palette');
    expect(chip.getAttribute('aria-label')).toBe(en['entrySearch.paletteAria']);
    // jsdom is not a Mac, so the visible label is the Windows/Linux one and the
    // announced shortcut has to agree with it.
    expect(chip.textContent).toBe(paletteShortcutLabel(false));
    expect(chip.getAttribute('aria-keyshortcuts')).toBe(paletteShortcutAria(false));
  });

  it('says ⌘ K on a Mac, in both the visible and the announced form', () => {
    expect(paletteShortcutLabel(true)).toBe('⌘ K');
    expect(paletteShortcutAria(true)).toBe('Meta+K');
  });
});

describe('EntryTopbarSearch — it opens the palette rather than answering itself', () => {
  it('asks for nothing until the user submits', () => {
    render(<EntryTopbarSearch />);
    fireEvent.change(screen.getByTestId(FIELD), { target: { value: 'design' } });
    // Typing alone must not throw a modal over the window the user is reading.
    expect(peekPendingCommandPalette()).toBeNull();
  });

  it('hands the typed query to the palette on Enter', () => {
    render(<EntryTopbarSearch />);
    fireEvent.change(screen.getByTestId(FIELD), { target: { value: 'design system' } });
    fireEvent.keyDown(screen.getByTestId(FIELD), { key: 'Enter' });
    expect(peekPendingCommandPalette()).toEqual({ query: 'design system', regex: null });
  });

  it('does the same for ArrowDown, which is the other reach for a result list', () => {
    render(<EntryTopbarSearch />);
    fireEvent.change(screen.getByTestId(FIELD), { target: { value: 'plugins' } });
    fireEvent.keyDown(screen.getByTestId(FIELD), { key: 'ArrowDown' });
    expect(peekPendingCommandPalette()).toEqual({ query: 'plugins', regex: null });
  });

  it('opens from the shortcut chip too, so it is not keyboard-only', () => {
    render(<EntryTopbarSearch />);
    fireEvent.click(screen.getByTestId('entry-topbar-search-palette'));
    expect(peekPendingCommandPalette()).toEqual({ query: '', regex: null });
  });

  it('leaves an ordinary keystroke alone', () => {
    render(<EntryTopbarSearch />);
    fireEvent.keyDown(screen.getByTestId(FIELD), { key: 'a' });
    expect(peekPendingCommandPalette()).toBeNull();
  });
});

describe('EntryTopbarSearch — the pattern actually travels', () => {
  it('carries the pattern and its flags once regex is switched on', () => {
    render(<EntryTopbarSearch />);
    enableRegex();
    fireEvent.change(screen.getByTestId(FIELD), { target: { value: 'desi(gn|ng)' } });
    fireEvent.keyDown(screen.getByTestId(FIELD), { key: 'Enter' });

    const request = peekPendingCommandPalette();
    expect(request?.query).toBe('desi(gn|ng)');
    expect(request?.regex?.source).toBe('desi(gn|ng)');
    // The controller's own default flags, not a set invented at the call site.
    expect(request?.regex?.flags).toEqual(expect.any(String));
    expect(screen.getByTestId(FIELD).getAttribute('data-regex-mode')).toBe('regex');
  });

  it('sends no pattern for an empty one, which would match every row', () => {
    render(<EntryTopbarSearch />);
    enableRegex();
    fireEvent.keyDown(screen.getByTestId(FIELD), { key: 'Enter' });
    expect(peekPendingCommandPalette()).toEqual({ query: '', regex: null });
  });

  it('sends no pattern while the field is still matching plain text', () => {
    render(<EntryTopbarSearch />);
    fireEvent.change(screen.getByTestId(FIELD), { target: { value: 'a.p' } });
    fireEvent.keyDown(screen.getByTestId(FIELD), { key: 'Enter' });
    expect(peekPendingCommandPalette()?.regex).toBeNull();
  });
});
