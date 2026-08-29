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

import {
  ContextMenu,
  type ContextMenuItem,
  type DestructiveConfirmationRequest,
  type DestructiveConfirmationReceipt,
  type TargetActionRequest,
  type TargetActionReceipt,
} from '../../src/components/ContextMenu';
import {
  ariaKeyShortcuts,
  shortcutKeyTokens,
} from '../../src/components/shortcuts/registry';

afterEach(() => {
  cleanup();
  document.querySelectorAll('[data-context-menu-opener]').forEach((element) => element.remove());
});

function acceptTargetAction(request: TargetActionRequest): TargetActionReceipt {
  return { ...request, phase: 'requested' };
}

function acceptDestructive(request: DestructiveConfirmationRequest) {
  return { ...request, phase: 'requested' as const };
}

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
      searchLabel="Menu actions"
      searchPlaceholder="Filter actions"
      noResultsLabel="No actions match this filter."
      resultCountLabel={(count) => `${count} actions`}
      onEditAppearance={acceptTargetAction}
      onLock={acceptTargetAction}
      editAppearanceLabel="Edit appearance…"
      lockLabel="Lock this element…"
      onRequestDestructiveConfirmation={acceptDestructive}
      destructiveUnavailableLabel="Confirmation is unavailable."
      disabledUnavailableLabel="This action is unavailable."
      identityUnavailableLabel="Duplicate identity is unavailable."
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

  it('keeps its surface inside an extremely small viewport', () => {
    const originalWidth = window.innerWidth;
    const originalHeight = window.innerHeight;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 10 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 10 });
    try {
      renderMenu({ x: 9, y: 9 });
      const menu = screen.getByTestId('menu');
      expect(Number.parseInt(menu.style.width, 10)).toBeLessThanOrEqual(10);
      expect(Number.parseInt(menu.style.left, 10)).toBeGreaterThanOrEqual(0);
      expect(Number.parseInt(menu.style.left, 10)).toBeLessThanOrEqual(10);
      expect(Number.parseInt(menu.style.top, 10)).toBeGreaterThanOrEqual(0);
      expect(Number.parseInt(menu.style.top, 10)).toBeLessThanOrEqual(10);
      expect(Number.parseInt(menu.style.maxHeight, 10)).toBeGreaterThanOrEqual(1);
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalHeight });
    }
  });

  it('is a mode: arrows walk it, Escape and Tab leave it', () => {
    const onClose = vi.fn();
    const opener = createOpener();
    renderMenu({ onClose, restoreFocusTo: opener });

    // The menu-owned search field takes focus on open, so filtering is the
    // first keyboard action for whoever opened it with the context-menu key.
    const filter = screen.getByTestId('menu-filter');
    expect(document.activeElement).toBe(filter);

    fireEvent.keyDown(filter, { key: 'ArrowDown' });
    expect(filter.getAttribute('aria-activedescendant')).toBe('menu-rename');

    fireEvent.keyDown(filter, { key: 'ArrowUp' });
    expect(filter.getAttribute('aria-activedescendant')).toBe('menu-open');

    fireEvent.keyDown(filter, { key: 'Tab' });
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

    expect(document.activeElement).toBe(screen.getByTestId('menu-filter'));
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

    expect(screen.getByTestId('menu-filter')).toHaveAttribute('aria-activedescendant', 'menu-rename');
  });

  it('filters locally and exposes an honest no-match state', () => {
    renderMenu();
    const filter = screen.getByTestId('menu-filter');
    fireEvent.change(filter, { target: { value: 'delete' } });

    expect(screen.queryByTestId('menu-open')).toBeNull();
    expect(screen.queryByTestId('menu-rename')).toBeNull();
    expect(screen.getByTestId('menu-delete')).toBeTruthy();
    expect(filter.getAttribute('data-regex-mode')).toBe('text');

    fireEvent.change(filter, { target: { value: 'does-not-exist' } });
    expect(screen.getByTestId('menu-no-results')).toHaveTextContent('No actions match');
  });

  it('adds real target-specific appearance and lock callbacks', () => {
    const onEditAppearance = vi.fn(acceptTargetAction);
    const onLock = vi.fn(acceptTargetAction);
    renderMenu({ onEditAppearance, onLock });

    fireEvent.click(screen.getByTestId('menu-edit-appearance'));
    expect(onEditAppearance).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('menu-lock-element'));
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it('does not accept an appearance callback that returns a mismatched receipt', () => {
    const onClose = vi.fn();
    const badReceipt = vi.fn(() => ({
      targetId: 'some-other-target',
      action: 'edit-appearance' as const,
      phase: 'opened' as const,
    }));
    renderMenu({ onClose, onEditAppearance: badReceipt });
    fireEvent.click(screen.getByTestId('menu-edit-appearance'));
    expect(badReceipt).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not close on a requested or cancelled lifecycle phase', () => {
    const onClose = vi.fn();
    renderMenu({
      onClose,
      onEditAppearance: (request) => ({ ...request, phase: 'requested' as const }),
    });
    fireEvent.click(screen.getByTestId('menu-edit-appearance'));
    expect(onClose).not.toHaveBeenCalled();
    cleanup();

    const cancelledClose = vi.fn();
    renderMenu({
      onClose: cancelledClose,
      onEditAppearance: (request) => ({ ...request, phase: 'cancelled' as const }),
    });
    fireEvent.click(screen.getByTestId('menu-edit-appearance'));
    expect(cancelledClose).not.toHaveBeenCalled();
  });

  it('requires a completed destructive confirmation before closing', () => {
    const onClose = vi.fn();
    const onRequest = vi.fn((request: DestructiveConfirmationRequest) => ({
      ...request,
      phase: 'opened' as const,
    }));
    renderMenu({
      onClose,
      items: [{ id: 'delete', label: 'Delete', danger: true, onSelect: vi.fn() }],
      onRequestDestructiveConfirmation: onRequest,
    });
    fireEvent.click(screen.getByTestId('menu-delete'));
    expect(onRequest).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    cleanup();
    const completedClose = vi.fn();
    renderMenu({
      onClose: completedClose,
      items: [{ id: 'delete', label: 'Delete', danger: true, onSelect: vi.fn() }],
      onRequestDestructiveConfirmation: (request) => ({ ...request, phase: 'completed' as const }),
    });
    fireEvent.click(screen.getByTestId('menu-delete'));
    expect(completedClose).toHaveBeenCalledTimes(1);
  });

  it('keeps a portalled builder inside its owning menu for pointer and scroll events', () => {
    const onClose = vi.fn();
    renderMenu({ onClose, ownerId: 'builder-owner' });
    fireEvent.click(screen.getByTestId('menu-filter-regex-toggle'));
    const popover = screen.getByTestId('menu-filter-regex-popover');
    fireEvent.pointerDown(popover);
    fireEvent.scroll(popover);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps simultaneous menus isolated by owner and field state', () => {
    render(
      <>
        <ContextMenu
          items={[{ id: 'one', label: 'One', onSelect: () => {} }]}
          x={0}
          y={0}
          ariaLabel="First"
          onClose={() => {}}
          testId="first"
          ownerId="first-owner"
          searchLabel="First actions"
          searchPlaceholder="Filter first"
          noResultsLabel="No first actions match."
          resultCountLabel={(count) => `${count} first actions`}
          onEditAppearance={acceptTargetAction}
          onLock={acceptTargetAction}
          editAppearanceLabel="Edit appearance…"
          lockLabel="Lock this element…"
          onRequestDestructiveConfirmation={acceptDestructive}
          destructiveUnavailableLabel="Confirmation is unavailable."
          disabledUnavailableLabel="This action is unavailable."
          identityUnavailableLabel="Duplicate identity is unavailable."
        />
        <ContextMenu
          items={[{ id: 'two', label: 'Two', onSelect: () => {} }]}
          x={0}
          y={0}
          ariaLabel="Second"
          onClose={() => {}}
          testId="second"
          ownerId="second-owner"
          searchLabel="Second actions"
          searchPlaceholder="Filter second"
          noResultsLabel="No second actions match."
          resultCountLabel={(count) => `${count} second actions`}
          onEditAppearance={acceptTargetAction}
          onLock={acceptTargetAction}
          editAppearanceLabel="Edit appearance…"
          lockLabel="Lock this element…"
          onRequestDestructiveConfirmation={acceptDestructive}
          destructiveUnavailableLabel="Confirmation is unavailable."
          disabledUnavailableLabel="This action is unavailable."
          identityUnavailableLabel="Duplicate identity is unavailable."
        />
      </>,
    );
    fireEvent.change(screen.getByTestId('first-filter'), { target: { value: 'one' } });
    expect(screen.getByTestId('first-one')).toBeTruthy();
    expect(screen.getByTestId('second-two')).toBeTruthy();
    expect(screen.queryByTestId('first-two')).toBeNull();
  });

  it('marks duplicate owner ids and resolves callback id collisions without dropping actions', () => {
    const view = (prefix: string) => (
      <ContextMenu
        items={[{ id: 'edit-appearance', label: 'Existing action', onSelect: () => {} }]}
        x={0}
        y={0}
        ariaLabel={prefix}
        onClose={() => {}}
        testId={prefix}
        ownerId="same-owner"
        searchLabel={`${prefix} actions`}
        searchPlaceholder="Filter actions"
        noResultsLabel="No actions match."
        resultCountLabel={(count) => `${count} actions`}
        onEditAppearance={acceptTargetAction}
        onLock={acceptTargetAction}
        editAppearanceLabel="Edit appearance…"
        lockLabel="Lock this element…"
        onRequestDestructiveConfirmation={acceptDestructive}
        destructiveUnavailableLabel="Confirmation is unavailable."
        disabledUnavailableLabel="This action is unavailable."
        identityUnavailableLabel="Duplicate identity is unavailable."
      />
    );
    render(<><div>{view('a')}</div><div>{view('b')}</div></>);
    expect(screen.getByTestId('a')).toHaveAttribute('data-callback-collision', 'true');
    expect(screen.getByTestId('b')).toHaveAttribute('data-owner-duplicate', 'true');
    expect(screen.getByTestId('a-edit-appearance-2')).toBeTruthy();
    expect(screen.getByTestId('a-lock-element')).toBeTruthy();
  });

  it('refuses duplicate item ids while keeping both labels visible', () => {
    renderMenu({
      items: [
        { id: 'same', label: 'First same id', onSelect: () => {} },
        { id: 'same', label: 'Second same id', onSelect: () => {} },
      ],
    });
    const menu = screen.getByTestId('menu');
    expect(menu).toHaveAttribute('data-item-duplicate', 'true');
    expect(screen.getByText('First same id').closest('button')).toBeDisabled();
    expect(screen.getByText('Second same id').closest('button')).toBeDisabled();
  });

  it('refuses item ids that collide after DOM sanitization', () => {
    renderMenu({
      items: [
        { id: 'same id', label: 'Space id', onSelect: vi.fn() },
        { id: 'same-id', label: 'Hyphen id', onSelect: vi.fn() },
      ],
    });
    expect(screen.getByText('Space id').closest('button')).toBeDisabled();
    expect(screen.getByText('Hyphen id').closest('button')).toBeDisabled();
  });

  it('refuses owner ids that collide after DOM sanitization', () => {
    const view = (ownerId: string, testId: string) => (
      <ContextMenu
        items={[{ id: 'open', label: 'Open', onSelect: vi.fn() }]}
        x={0}
        y={0}
        ariaLabel={testId}
        onClose={() => {}}
        testId={testId}
        ownerId={ownerId}
        searchLabel="Actions"
        searchPlaceholder="Filter actions"
        noResultsLabel="No actions match."
        resultCountLabel={(count) => `${count} actions`}
        onEditAppearance={acceptTargetAction}
        onLock={acceptTargetAction}
        editAppearanceLabel="Edit appearance…"
        lockLabel="Lock this element…"
        onRequestDestructiveConfirmation={acceptDestructive}
        destructiveUnavailableLabel="Confirmation is unavailable."
        disabledUnavailableLabel="This action is unavailable."
        identityUnavailableLabel="Duplicate identity is unavailable."
      />
    );
    render(<><div>{view('same owner', 'sanitized-a')}</div><div>{view('same-owner', 'sanitized-b')}</div></>);
    expect(screen.getByTestId('sanitized-a')).toHaveAttribute('data-owner-duplicate', 'true');
    expect(screen.getByTestId('sanitized-b')).toHaveAttribute('data-owner-duplicate', 'true');
    expect(screen.getByTestId('sanitized-a-open')).toBeDisabled();
  });

  it('refuses a dangerous action when no confirmation handoff exists', () => {
    const onSelect = vi.fn();
    renderMenu({
      items: [{ id: 'delete', label: 'Delete', danger: true, onSelect }],
      onRequestDestructiveConfirmation: undefined as unknown as (
        request: DestructiveConfirmationRequest,
      ) => DestructiveConfirmationReceipt,
    });
    const deleteButton = screen.getByTestId('menu-delete');
    expect(deleteButton).toBeDisabled();
    expect(deleteButton).toHaveAttribute('title', 'Confirmation is unavailable.');
    expect(deleteButton).toHaveTextContent('Confirmation is unavailable.');
    fireEvent.click(deleteButton);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('routes a dangerous action to confirmation before any item callback', () => {
    const onSelect = vi.fn();
    const requestConfirmation = vi.fn(acceptDestructive);
    const item = { id: 'delete', label: 'Delete', danger: true, onSelect };
    renderMenu({ items: [item], onRequestDestructiveConfirmation: requestConfirmation });
    fireEvent.click(screen.getByTestId('menu-delete'));
    expect(requestConfirmation).toHaveBeenCalledWith({
      targetId: 'menu',
      itemId: item.id,
      label: item.label,
    });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('accepts touch activation through the same real item callback', () => {
    const onSelect = vi.fn();
    renderMenu({ items: [{ id: 'touch', label: 'Touch action', onSelect }] });
    const item = screen.getByTestId('menu-touch');
    fireEvent.pointerDown(item, { pointerType: 'touch' });
    fireEvent.pointerUp(item, { pointerType: 'touch' });
    fireEvent.click(item);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
