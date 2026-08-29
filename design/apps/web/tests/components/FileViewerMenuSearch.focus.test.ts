// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import {
  focusRelativeMenuItem,
  shouldCloseMenuOnTab,
} from '../../src/components/FileViewerMenuSearch';

function focusableAction() {
  const focus = vi.fn();
  return {
    action: { element: { focus } as unknown as HTMLElement },
    focus,
  };
}

describe('FileViewer menu relative focus', () => {
  it('leaves focus unchanged when a filtered menu has no enabled actions', () => {
    expect(() => focusRelativeMenuItem([], null, 1)).not.toThrow();
  });

  it('moves forward and backward through enabled actions with wrapping', () => {
    const first = focusableAction();
    const second = focusableAction();
    const third = focusableAction();
    const actions = [first.action, second.action, third.action];

    focusRelativeMenuItem(actions, first.action.element, 1);
    focusRelativeMenuItem(actions, first.action.element, -1);
    focusRelativeMenuItem(actions, third.action.element, 1);

    expect(first.focus).toHaveBeenCalledTimes(1);
    expect(second.focus).toHaveBeenCalledTimes(1);
    expect(third.focus).toHaveBeenCalledTimes(1);
  });

  it('keeps Tab inside the owned portalled regex builder', () => {
    const owner = 'file-viewer-menu-owner-1';
    const builder = document.createElement('div');
    builder.setAttribute('data-file-viewer-menu-builder', owner);
    const input = document.createElement('input');
    builder.append(input);
    document.body.append(builder);

    expect(shouldCloseMenuOnTab('menu', input, owner)).toBe(false);
    expect(shouldCloseMenuOnTab('menu', document.body, owner)).toBe(true);
    expect(shouldCloseMenuOnTab('mixed', input, owner)).toBe(false);

    builder.remove();
  });
});
