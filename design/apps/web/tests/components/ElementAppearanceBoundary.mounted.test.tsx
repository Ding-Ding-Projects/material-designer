// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

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
    const targetId = 'appearance:div-1/save-project:0';
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
});
