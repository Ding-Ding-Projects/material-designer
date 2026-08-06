// @vitest-environment jsdom

// What a context menu promises, checked against the table it promises it from.
//
// The interesting assertions here are the drift ones. `ContextMenu` prints
// keycaps and `useShortcuts` installs handlers, and both read `SHORTCUTS` —
// so a test that hard-codes "Ctrl" and "F2" would go green on a menu that had
// quietly stopped agreeing with the binding. Every expectation below is
// derived from the registry instead, which means renaming a binding moves the
// menu and the test together, and *unwiring* one fails the test.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ContextMenu, type ContextMenuItem } from '../../src/components/ContextMenu';
import {
  ariaKeyShortcuts,
  shortcutKeyTokens,
} from '../../src/components/shortcuts/registry';

afterEach(() => {
  cleanup();
  document.querySelectorAll('[data-context-menu-opener]').forEach((element) => element.remove());
});

function createOpener(): HTMLButtonElement {
  const opener = document.createElement('button');
  opener.type = 'button';
  opener.textContent = 'Open menu';
  opener.dataset.contextMenuOpener = 'true';
  document.body.append(opener);
  opener.focus();
  return opener;
}

function items(overrides: Partial<ContextMenuItem>[] = []): ContextMenuItem[] {
  const base: ContextMenuItem[] = [
    { id: 'open', label: 'Open in tab', onSelect: () => {} },
    { id: 'rename', label: 'Rename', shortcutId: 'designFiles.rename', onSelect: () => {} },
    {
      id: 'delete',
      label: 'Delete',
      danger: true,
      separatorBefore: true,
      shortcutId: 'designFiles.delete',
      onSelect: () => {},
    },
  ];
  return base.map((item, index) => ({ ...item, ...(overrides[index] ?? {}) }));
}

function renderMenu(props: Partial<Parameters<typeof ContextMenu>[0]> = {}) {
  return render(
    <ContextMenu
      items={items()}
      x={120}
      y={90}
      ariaLabel="site.html"
      onClose={() => {}}
      testId="menu"
      mac={false}
      {...props}
    />,
  );
}

describe('ContextMenu', () => {
  it('draws the keycaps the registry defines, not a second copy of them', () => {
    renderMenu();

    const rename = screen.getByTestId('menu-rename');
    const caps = Array.from(rename.querySelectorAll('kbd')).map((key) => key.textContent);

    expect(caps).toEqual(shortcutKeyTokens('designFiles.rename', { mac: false }));
    expect(caps.length).toBeGreaterThan(0);
  });

  it('follows the platform, so a Windows menu never offers a Mac chord', () => {
    // `selection.selectPage` is bound with the `primary` flag — the one that
    // means Cmd on macOS and Ctrl everywhere else. It is the binding where a
    // platform mistake is actually visible.
    const selectAll: ContextMenuItem[] = [
      { id: 'all', label: 'Select page', shortcutId: 'selection.selectPage', onSelect: () => {} },
    ];

    const { unmount } = renderMenu({ items: selectAll, mac: false });
    const windowsCaps = Array.from(
      screen.getByTestId('menu-all').querySelectorAll('kbd'),
    ).map((key) => key.textContent);
    expect(windowsCaps).toEqual(shortcutKeyTokens('selection.selectPage', { mac: false }));
    expect(screen.getByTestId('menu-all').getAttribute('aria-keyshortcuts')).toBe('Control+A');
    unmount();

    renderMenu({ items: selectAll, mac: true });
    const macCaps = Array.from(
      screen.getByTestId('menu-all').querySelectorAll('kbd'),
    ).map((key) => key.textContent);
    expect(macCaps).toEqual(shortcutKeyTokens('selection.selectPage', { mac: true }));
    expect(macCaps).not.toEqual(windowsCaps);
    expect(screen.getByTestId('menu-all').getAttribute('aria-keyshortcuts')).toBe('Meta+A');
  });

  it('announces the shortcut as a shortcut, and only once', () => {
    renderMenu();

    const rename = screen.getByTestId('menu-rename');
    expect(rename.getAttribute('aria-keyshortcuts')).toBe(
      ariaKeyShortcuts('designFiles.rename', { mac: false }),
    );
    // The keycaps are hidden from assistive technology, so the label is not
    // read out and then spelled out — "Rename, F2, F2" is a menu that has
    // stopped being useful at the moment it was trying hardest.
    const key = rename.querySelector('kbd');
    expect(key).toBeTruthy();
    expect(key?.closest('[aria-hidden="true"]')).toBeTruthy();
  });

  it('shows nothing at all for an item with no binding', () => {
    renderMenu();

    const open = screen.getByTestId('menu-open');
    expect(open.querySelectorAll('kbd')).toHaveLength(0);
    expect(open.getAttribute('aria-keyshortcuts')).toBeNull();
  });

  it('bounds itself to the viewport instead of running off the bottom', () => {
    // 40 rows is far more than the 768px jsdom viewport can hold, so the
    // estimate goes negative and the clamp is what keeps the card on screen.
    const many: ContextMenuItem[] = Array.from({ length: 40 }, (_, index) => ({
      id: `row-${index}`,
      label: `Row ${index}`,
      onSelect: () => {},
    }));
    renderMenu({ items: many, y: 700 });

    const menu = screen.getByTestId('menu');
    expect(Number.parseInt(menu.style.top, 10)).toBeGreaterThanOrEqual(0);
    expect(Number.parseInt(menu.style.left, 10)).toBeGreaterThanOrEqual(0);
  });

  it('shrinks its card to fit a narrow viewport', () => {
    const originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 200 });
    try {
      renderMenu();
      const menu = screen.getByTestId('menu');
      expect(Number.parseInt(menu.style.width, 10)).toBe(184);
      expect(Number.parseInt(menu.style.left, 10)).toBeGreaterThanOrEqual(8);
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth });
    }
  });

  it('is a mode: arrows walk it, Escape and Tab leave it', () => {
    const onClose = vi.fn();
    const opener = createOpener();
    renderMenu({ onClose, restoreFocusTo: opener });

    // The first enabled item takes focus on open, so the menu is operable for
    // whoever opened it with the context-menu key.
    expect(document.activeElement).toBe(screen.getByTestId('menu-open'));

    fireEvent.keyDown(screen.getByTestId('menu-open'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByTestId('menu-rename'));

    fireEvent.keyDown(screen.getByTestId('menu-rename'), { key: 'ArrowUp' });
    expect(document.activeElement).toBe(screen.getByTestId('menu-open'));

    fireEvent.keyDown(screen.getByTestId('menu-open'), { key: 'Tab' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(opener);
  });

  it.each([
    ['outside pointer dismissal', (_menu: HTMLElement) => fireEvent.pointerDown(document.body)],
    ['scroll dismissal', (_menu: HTMLElement) => fireEvent.scroll(window)],
  ])('restores focus after %s', (_name, dismiss) => {
    const opener = createOpener();
    renderMenu({ restoreFocusTo: opener });

    expect(document.activeElement).toBe(screen.getByTestId('menu-open'));
    dismiss(screen.getByTestId('menu'));
    expect(document.activeElement).toBe(opener);
  });

  it('does not refocus the old opener when another menu opener is pressed', () => {
    const firstOpener = createOpener();
    const secondOpener = createOpener();
    renderMenu({ restoreFocusTo: firstOpener });

    secondOpener.focus();
    fireEvent.pointerDown(secondOpener);
    expect(document.activeElement).toBe(secondOpener);
  });

  it('runs the item and closes before it, so the menu cannot outlive its target', () => {
    const order: string[] = [];
    const onClose = () => order.push('close');
    const opener = createOpener();
    renderMenu({
      onClose,
      restoreFocusTo: opener,
      items: [{ id: 'open', label: 'Open', onSelect: () => order.push('select') }],
    });

    fireEvent.click(screen.getByTestId('menu-open'));
    expect(order).toEqual(['close', 'select']);
    expect(document.activeElement).toBe(opener);
  });

  it('keeps the full bilingual label in the menu structure', () => {
    const label = 'Edit appearance… · 編輯外觀設定，調整字型、色彩、間距及所有狀態';
    renderMenu({
      items: [{ id: 'appearance', label, onSelect: () => {} }],
    });

    const menuItem = screen.getByTestId('menu-appearance');
    const labelElement = menuItem.querySelector('[class*="label"]');
    expect(labelElement?.textContent).toBe(label);
    expect(labelElement?.getAttribute('title')).toBe(label);
  });

  it('skips a disabled item rather than parking focus on it', () => {
    renderMenu({ items: items([{ disabled: true }]) });

    expect(document.activeElement).toBe(screen.getByTestId('menu-rename'));
  });
});
