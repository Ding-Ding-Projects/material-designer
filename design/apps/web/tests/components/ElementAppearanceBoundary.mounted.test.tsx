// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ElementAppearanceBoundary } from '../../src/components/appearance/ElementAppearanceBoundary';
import { ElementAppearanceEditor } from '../../src/components/appearance/ElementAppearanceEditor';
import {
  applyAppearanceStateToElement,
  clearAppearanceStateFromElement,
  defaultAppearanceStyle,
  getElementAppearance,
  hasElementAppearanceOverride,
  resetElementAppearanceStore,
  setElementAppearance,
} from '../../src/components/appearance/elementAppearance';
import { publishElementToyLockState, ELEMENT_TOY_LOCK_ACTIVATION, ELEMENT_TOY_LOCK_CONFIGURATION, requestElementToyLock } from '../../src/components/appearance/toyLockAdapter';
import { emitSettingsTabAppearanceRequest, registerSettingsTabAppearanceConsumer, SETTINGS_TAB_APPEARANCE_EDITOR_EVENT } from '../../src/components/settings/settings-tab-appearance-consumer';

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

  it('restores the target projection when the boundary unmounts', () => {
    const { container, unmount } = render(
      <ElementAppearanceBoundary>
        <button type="button" data-testid="unmount-target" dir="rtl">Unmount target</button>
      </ElementAppearanceBoundary>,
    );
    const button = container.querySelector('[data-testid="unmount-target"]') as HTMLButtonElement;
    clearAppearanceStateFromElement(button);
    button.style.setProperty('color', 'rebeccapurple', 'important');
    button.style.setProperty('transform', 'scale(2)', 'important');
    button.style.setProperty('direction', 'rtl', 'important');
    button.style.setProperty('filter', 'grayscale(1)', 'important');
    button.style.setProperty('--element-appearance-overrides', 'existing', 'important');
    const appearance = defaultAppearanceStyle();
    appearance.textDirection = 'ltr';
    appearance.textColor = 'rgb(12 34 56)';
    applyAppearanceStateToElement(button, appearance, 'focus');
    expect(button.style.color).not.toBe('rebeccapurple');
    unmount();
    expect(button.style.getPropertyValue('color')).toBe('rebeccapurple');
    expect(button.style.getPropertyPriority('color')).toBe('important');
    expect(button.style.getPropertyValue('transform')).toBe('scale(2)');
    expect(button.style.getPropertyPriority('transform')).toBe('important');
    expect(button.style.getPropertyValue('direction')).toBe('rtl');
    expect(button.style.getPropertyPriority('direction')).toBe('important');
    expect(button.style.getPropertyValue('filter')).toBe('grayscale(1)');
    expect(button.style.getPropertyPriority('filter')).toBe('important');
    expect(button.style.getPropertyValue('--element-appearance-overrides')).toBe('existing');
    expect(button.style.getPropertyPriority('--element-appearance-overrides')).toBe('important');
    expect(button.getAttribute('dir')).toBe('rtl');
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

  it('observes the supplied root, discovers dynamic shadow descendants, and opens the settings handoff editor', async () => {
    const observationRoot = document.createElement('section');
    const shadowHost = document.createElement('div');
    const shadowRoot = shadowHost.attachShadow({ mode: 'open' });
    const shadowButton = document.createElement('button');
    shadowButton.setAttribute('data-testid', 'shadow-appearance-target');
    shadowButton.textContent = 'Shadow target';
    shadowRoot.append(shadowButton);
    observationRoot.append(shadowHost);
    const mountContainer = document.createElement('div');
    observationRoot.append(mountContainer);
    document.body.append(observationRoot);
    const { container, unmount } = render(
      <ElementAppearanceBoundary observationRoot={observationRoot} copy={(english) => `fixture:${english}`}>
        <button type="button" data-testid="scoped-target">Scoped target</button>
      </ElementAppearanceBoundary>,
      { container: mountContainer },
    );
    const editorRequests: CustomEvent[] = [];
    const onEditorRequest = (event: Event) => editorRequests.push(event as CustomEvent);
    window.addEventListener(SETTINGS_TAB_APPEARANCE_EDITOR_EVENT, onEditorRequest);
    const unregisterConsumer = registerSettingsTabAppearanceConsumer(() => undefined);
    shadowButton.focus();
    expect(emitSettingsTabAppearanceRequest({ section: 'appearance', anchor: shadowButton })).toBe(true);
    await waitFor(() => expect(editorRequests).toHaveLength(1));
    await waitFor(() => expect(screen.getByTestId('element-appearance-editor')).toBeTruthy());
    expect(screen.getByTestId('element-appearance-editor').getAttribute('aria-label')).toContain('fixture:Edit appearance for');
    expect(editorRequests[0]?.detail.anchor).toBe(shadowButton);
    fireEvent.click(screen.getByRole('button', { name: /fixture:Close appearance editor/i }));
    await waitFor(() => expect(document.activeElement).toBe(shadowHost));

    const dynamicHost = document.createElement('div');
    observationRoot.append(dynamicHost);
    const dynamicShadow = dynamicHost.attachShadow({ mode: 'open' });
    const dynamicButton = document.createElement('button');
    dynamicButton.setAttribute('data-testid', 'dynamic-shadow-target');
    dynamicButton.textContent = 'Dynamic shadow target';
    dynamicShadow.append(dynamicButton);
    await waitFor(() => {
      fireEvent.contextMenu(dynamicButton, { clientX: 20, clientY: 20 });
      expect(screen.getByRole('menu')).toBeTruthy();
      expect(screen.getByRole('menu').getAttribute('aria-label')).toContain('Dynamic shadow target');
    });

    window.removeEventListener(SETTINGS_TAB_APPEARANCE_EDITOR_EVENT, onEditorRequest);
    unregisterConsumer();
    unmount();
    container.remove();
    mountContainer.remove();
    observationRoot.remove();
  });

  it('resolves keyboard commands and locked activation to an open-shadow descendant', async () => {
    const observationRoot = document.createElement('section');
    const shadowHost = document.createElement('div');
    const shadowRoot = shadowHost.attachShadow({ mode: 'open' });
    const shadowButton = document.createElement('button');
    shadowButton.setAttribute('data-testid', 'shadow-keyboard-target');
    shadowButton.textContent = 'Shadow keyboard target';
    shadowRoot.append(shadowButton);
    observationRoot.append(shadowHost);
    document.body.append(observationRoot);
    const activation = vi.fn();
    window.addEventListener(ELEMENT_TOY_LOCK_ACTIVATION, activation);
    const { unmount } = render(
      <ElementAppearanceBoundary observationRoot={observationRoot}>
        <span data-testid="keyboard-scope">Scope</span>
      </ElementAppearanceBoundary>,
    );
    const press = (key: string, init: KeyboardEventInit = {}) => shadowButton.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true, ...init }));

    shadowButton.focus();
    press('F10', { shiftKey: true });
    await waitFor(() => expect(screen.getByRole('menu').getAttribute('aria-label')).toContain('Shadow keyboard target'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit appearance…' }));
    await waitFor(() => expect(screen.getByTestId('element-appearance-editor').getAttribute('aria-label')).toContain('Shadow keyboard target'));
    fireEvent.click(screen.getByRole('button', { name: /Close appearance editor/i }));

    press('ContextMenu');
    await waitFor(() => expect(screen.getByRole('menu').getAttribute('aria-label')).toContain('Shadow keyboard target'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Close menu' }));

    publishElementToyLockState({ targetId: 'appearance:shadow-keyboard-target', locked: true, policy: 'pin' });
    await waitFor(() => expect(shadowButton.getAttribute('aria-disabled')).toBe('true'));
    press('Enter');
    press(' ');
    expect(activation).toHaveBeenCalledTimes(2);
    expect(activation.mock.calls.every(([event]) => (event as CustomEvent).detail.anchor === shadowButton)).toBe(true);

    window.removeEventListener(ELEMENT_TOY_LOCK_ACTIVATION, activation);
    unmount();
    observationRoot.remove();
  });
});
