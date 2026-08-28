// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ElementAppearanceBoundary } from '../../src/components/appearance/ElementAppearanceBoundary';
import { ElementAppearanceEditor } from '../../src/components/appearance/ElementAppearanceEditor';
import {
  clearAppearanceStateFromElement,
  defaultAppearanceStyle,
  getElementAppearance,
  hasElementAppearanceOverride,
  resetElementAppearanceStore,
  setElementAppearance,
} from '../../src/components/appearance/elementAppearance';
import { publishElementToyLockState, ELEMENT_TOY_LOCK_ACTIVATION, ELEMENT_TOY_LOCK_CONFIGURATION, requestElementToyLock } from '../../src/components/appearance/toyLockAdapter';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  resetElementAppearanceStore();
});

describe('ElementAppearanceBoundary mounted behavior', () => {
  it('keeps neutral defaults inherited until a mounted edit is made', () => {
    const { container } = render(
      <ElementAppearanceBoundary>
        <button type="button" aria-label="Save project">Save project</button>
      </ElementAppearanceBoundary>,
    );
    const button = container.querySelector('button[aria-label="Save project"]') as HTMLButtonElement;
    expect(button.style.fontSize).toBe('');
    expect(button.style.color).toBe('');
    expect(hasElementAppearanceOverride('appearance:button-1')).toBe(false);
    expect(window.localStorage.getItem('open-design:element-appearance:v1')).toBeNull();
  });

  it('opens a target-specific menu and anchored editor through pointer and keyboard routes', () => {
    const { container } = render(
      <ElementAppearanceBoundary>
        <button type="button" aria-label="Save project">Save project</button>
      </ElementAppearanceBoundary>,
    );
    const button = container.querySelector('button[aria-label="Save project"]') as HTMLButtonElement;
    fireEvent.contextMenu(button, { clientX: 20, clientY: 20 });
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Edit appearance…' })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit appearance…' }));
    expect(screen.getByTestId('element-appearance-editor')).toBeTruthy();

    fireEvent.keyDown(button, { key: 'F10', shiftKey: true });
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('applies a persisted state to a real mounted renderer target', () => {
    const targetId = 'appearance:save-project';
    const appearance = getElementAppearance(targetId);
    appearance.states.hover = { ...defaultAppearanceStyle(), fontSize: 22, borderRadius: 24, elevation: 4 };
    appearance.activeState = 'hover';
    setElementAppearance(targetId, appearance, 'Test hover state');
    const { container } = render(
      <ElementAppearanceBoundary>
        <button type="button" data-testid="save-project">Save project</button>
      </ElementAppearanceBoundary>,
    );
    const button = container.querySelector('[data-testid="save-project"]') as HTMLButtonElement;
    expect(button.style.fontSize).toBe('22px');
    expect(button.style.borderRadius).toBe('24px');
    expect(button.dataset.elementAppearanceState).toBe('hover');
    clearAppearanceStateFromElement(button);
    expect(button.style.fontSize).toBe('');
  });

  it('supports editor property updates through a mounted target', () => {
    const target = document.createElement('button');
    target.setAttribute('aria-label', 'Mounted target');
    document.body.append(target);
    render(<ElementAppearanceEditor target={{ id: 'appearance:mounted-target:0', label: 'Mounted target', role: 'button', path: '[aria-label="Mounted target"]', element: target }} onClose={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Font size (px)'), { target: { value: '20' } });
    expect(target.style.fontSize).toBe('20px');
    expect(JSON.parse(window.localStorage.getItem('open-design:element-appearance:v1') ?? '{}')).toBeTruthy();
  });

  it('intercepts a locked target and emits the shared toy-lock activation event', () => {
    const { container } = render(
      <ElementAppearanceBoundary>
        <button type="button" data-testid="locked-target">Locked target</button>
      </ElementAppearanceBoundary>,
    );
    const button = container.querySelector('[data-testid="locked-target"]') as HTMLButtonElement;
    const activation = vi.fn();
    window.addEventListener(ELEMENT_TOY_LOCK_ACTIVATION, activation);
    publishElementToyLockState({ targetId: 'appearance:locked-target', locked: true, policy: 'pin' });
    fireEvent.click(button);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(activation).toHaveBeenCalledTimes(1);
    window.removeEventListener(ELEMENT_TOY_LOCK_ACTIVATION, activation);
  });

  it('forwards element lock configuration requests to the toy-lock lane', () => {
    const { container } = render(<ElementAppearanceBoundary onLockElement={requestElementToyLock}><button type="button" data-testid="lock-config-target">Configure lock</button></ElementAppearanceBoundary>);
    const button = container.querySelector('[data-testid="lock-config-target"]') as HTMLButtonElement;
    const configuration = vi.fn();
    window.addEventListener(ELEMENT_TOY_LOCK_CONFIGURATION, configuration);
    fireEvent.contextMenu(button, { clientX: 12, clientY: 12 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Lock this element…' }));
    expect(configuration).toHaveBeenCalledTimes(1);
    expect(configuration.mock.calls[0]?.[0]?.detail.targetId).toBe('appearance:lock-config-target');
    window.removeEventListener(ELEMENT_TOY_LOCK_CONFIGURATION, configuration);
  });
});
