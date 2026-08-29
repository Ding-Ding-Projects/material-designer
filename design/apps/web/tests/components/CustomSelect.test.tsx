// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomSelect, type LockedActivationRequest, type LockedActivationReceipt } from '../../src/components/CustomSelect';

afterEach(() => cleanup());

function dispatchWithoutComposedPath(target: EventTarget, type: 'pointerdown' | 'mousedown') {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'composedPath', { value: undefined });
  act(() => target.dispatchEvent(event));
}

describe('CustomSelect', () => {
  it('renders the selected label and chooses an option from the portal menu', () => {
    const onChange = vi.fn();
    render(
      <CustomSelect
        ariaLabel="Model"
        value="gpt-image-2"
        options={[
          { value: 'gpt-image-2', label: 'GPT Image 2' },
          { value: 'seedance', label: 'Seedance' },
        ]}
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole('combobox', { name: 'Model: GPT Image 2' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(screen.getByRole('option', { name: /Seedance/ }));
    expect(onChange).toHaveBeenCalledWith('seedance');
  });

  it('skips disabled options and supports keyboard selection', () => {
    const onChange = vi.fn();
    render(
      <CustomSelect
        ariaLabel="Provider"
        value="openai"
        options={[
          { value: 'openai', label: 'OpenAI' },
          { value: 'disabled', label: 'Disabled', disabled: true },
          { value: 'custom', label: 'Custom' },
        ]}
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole('combobox', { name: 'Provider: OpenAI' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(trigger.getAttribute('aria-activedescendant')).toBe(
      screen.getByRole('option', { name: /Custom/ }).id,
    );
    expect(trigger.getAttribute('aria-activedescendant')).not.toBe(
      screen.getByRole('option', { name: /Disabled/ }).id,
    );

    fireEvent.keyDown(trigger, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('custom');
    expect(onChange).not.toHaveBeenCalledWith('disabled');
  });

  it('keeps keyboard navigation active state across parent rerenders with fresh options', () => {
    const onChange = vi.fn();
    const options = () => [
      { value: 'first', label: 'First' },
      { value: 'second', label: 'Second' },
      { value: 'third', label: 'Third' },
    ];
    const { rerender } = render(
      <CustomSelect
        ariaLabel="Template"
        value="first"
        options={options()}
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole('combobox', { name: 'Template: First' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(trigger.getAttribute('aria-activedescendant')).toBe(
      screen.getByRole('option', { name: /Second/ }).id,
    );

    rerender(
      <CustomSelect
        ariaLabel="Template"
        value="first"
        options={options()}
        onChange={onChange}
      />,
    );

    const rerenderedTrigger = screen.getByRole('combobox', { name: 'Template: First' });
    expect(rerenderedTrigger.getAttribute('aria-activedescendant')).toBe(
      screen.getByRole('option', { name: /Second/ }).id,
    );
  });

  it('returns focus to the trigger after outside pointer dismissal', () => {
    render(
      <CustomSelect
        testId="outside-focus"
        ariaLabel="Outside focus"
        value="one"
        options={[{ value: 'one', label: 'One' }]}
        onChange={() => {}}
      />,
    );
    const trigger = screen.getByTestId('outside-focus');
    fireEvent.click(trigger);
    const outside = document.createElement('button');
    outside.type = 'button';
    outside.textContent = 'Outside';
    document.body.appendChild(outside);
    outside.focus();
    fireEvent.pointerDown(outside);
    expect(document.activeElement).toBe(trigger);
    outside.remove();
  });

  it('renders an isolated search, result count, no-results state, and lock wrapper', () => {
    const onChange = vi.fn();
    const { unmount } = render(
      <CustomSelect
        testId="provider"
        ariaLabel="Provider"
        value="openai"
        options={[
          { value: 'openai', label: 'OpenAI' },
          { value: 'local', label: 'Local model' },
        ]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId('provider'));
    const filter = screen.getByTestId('provider-filter');
    expect(filter.getAttribute('data-regex-mode')).toBe('text');
    expect(screen.getByText('2 options')).toBeTruthy();
    fireEvent.change(filter, { target: { value: 'missing' } });
    expect(screen.getByTestId('provider-no-results').textContent).toBe('No options match this filter.');
    expect(screen.getByText('0 options')).toBeTruthy();
    unmount();

    const onLockedActivate = vi.fn((request: LockedActivationRequest): LockedActivationReceipt => ({
      targetId: request.targetId,
      phase: 'opened',
    }));
    render(
      <CustomSelect
        testId="locked-provider"
        ariaLabel="Locked provider"
        value="openai"
        options={[{ value: 'openai', label: 'OpenAI' }]}
        onChange={onChange}
        locked
        lockedReason="Unlock this provider first."
        onLockedActivate={onLockedActivate}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Locked provider: locked' }));
    expect(onLockedActivate).toHaveBeenCalledWith({ targetId: 'locked-provider', input: 'programmatic' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('routes pointer, keyboard, programmatic, and context activation through the real locked wrapper', () => {
    const onLockedActivate = vi.fn((request: LockedActivationRequest): LockedActivationReceipt => ({
      targetId: request.targetId,
      phase: 'opened',
    }));
    render(
      <CustomSelect
        testId="locked-routes"
        ariaLabel="Locked routes"
        value="one"
        options={[{ value: 'one', label: 'One' }]}
        onChange={() => {}}
        locked
        lockedReason="Unlock this control first."
        onLockedActivate={onLockedActivate}
      />,
    );
    const wrapper = screen.getByRole('button', { name: 'Locked routes: locked' });
    expect(screen.getByTestId('locked-routes').hasAttribute('disabled')).toBe(true);
    fireEvent.pointerDown(wrapper);
    fireEvent.click(wrapper);
    fireEvent.keyDown(wrapper, { key: 'Enter' });
    fireEvent.contextMenu(wrapper);
    wrapper.click();
    expect(onLockedActivate.mock.calls.map(([request]) => request.input)).toEqual([
      'pointer',
      'keyboard',
      'context',
      'programmatic',
    ]);
  });

  it('keeps every real portalled regex-builder control inside its select owner', () => {
    render(
      <CustomSelect
        testId="portal-owner"
        ariaLabel="Provider"
        value="openai"
        options={[
          { value: 'openai', label: 'OpenAI' },
          { value: 'local', label: 'Local model' },
        ]}
        onChange={() => {}}
      />,
    );
    const trigger = screen.getByTestId('portal-owner');
    fireEvent.click(trigger);
    const toggle = screen.getByTestId('portal-owner-filter-regex-toggle');
    fireEvent.pointerDown(toggle);
    fireEvent.click(toggle);
    const popover = screen.getByTestId('portal-owner-filter-regex-popover');
    expect(popover).toBeTruthy();
    const enableRegex = screen.getByTestId('portal-owner-filter-regex-enable-regex');
    fireEvent.pointerDown(enableRegex);
    fireEvent.click(enableRegex);
    expect(screen.getByTestId('portal-owner-filter-regex-popover')).toBeTruthy();
    const ignoreCase = screen.getByTestId('portal-owner-filter-regex-flag-i');
    fireEvent.pointerDown(ignoreCase);
    fireEvent.click(ignoreCase);
    expect(screen.getByTestId('portal-owner-filter-regex-popover')).toBeTruthy();
    const pattern = screen.getByTestId('portal-owner-filter-regex-pattern');
    fireEvent.pointerDown(pattern);
    fireEvent.change(pattern, { target: { value: 'local' } });
    expect(screen.getByRole('option', { name: 'Local model' })).toBeTruthy();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(pattern, { key: 'ArrowDown' });
    expect(screen.getByTestId('portal-owner-filter-regex-popover')).toBeTruthy();
  });

  it('uses the concrete portal root for pointer and mouse fallback ownership, then unregisters it', () => {
    render(
      <CustomSelect
        testId="portal-fallback"
        ariaLabel="Provider"
        value="openai"
        options={[{ value: 'openai', label: 'OpenAI' }]}
        onChange={() => {}}
      />,
    );
    const trigger = screen.getByTestId('portal-fallback');
    fireEvent.click(trigger);
    fireEvent.click(screen.getByTestId('portal-fallback-filter-regex-toggle'));
    const popover = screen.getByTestId('portal-fallback-filter-regex-popover');
    expect(popover.getAttribute('data-focus-scope')).toBeTruthy();
    expect(popover.getAttribute('data-file-viewer-menu-builder')).toBe(
      popover.getAttribute('data-focus-scope'),
    );
    fireEvent.click(screen.getByTestId('portal-fallback-filter-regex-enable-regex'));
    const pattern = screen.getByTestId('portal-fallback-filter-regex-pattern');

    dispatchWithoutComposedPath(pattern, 'pointerdown');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    dispatchWithoutComposedPath(pattern, 'mousedown');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(screen.getByTestId('portal-fallback-filter-regex-close'));
    expect(screen.queryByTestId('portal-fallback-filter-regex-popover')).toBeNull();

    // The old root is deliberately reattached after the field unregisters it.
    // A stale marker must not keep the select open once the real node is gone.
    document.body.appendChild(popover);
    dispatchWithoutComposedPath(popover, 'pointerdown');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    popover.remove();
  });

  it('keeps simultaneous selects independent and rejects copied marker ownership', () => {
    render(
      <>
        <CustomSelect
          testId="portal-a"
          ariaLabel="Provider A"
          value="openai"
          options={[{ value: 'openai', label: 'OpenAI' }]}
          onChange={() => {}}
        />
        <CustomSelect
          testId="portal-b"
          ariaLabel="Provider B"
          value="local"
          options={[{ value: 'local', label: 'Local' }]}
          onChange={() => {}}
        />
      </>,
    );
    const triggerA = screen.getByTestId('portal-a');
    const triggerB = screen.getByTestId('portal-b');

    fireEvent.click(triggerA);
    fireEvent.click(screen.getByTestId('portal-a-filter-regex-toggle'));
    expect(triggerA.getAttribute('aria-expanded')).toBe('true');

    // A second select is a real outside target for A, so it closes A before B opens.
    fireEvent.pointerDown(triggerB);
    fireEvent.click(triggerB);
    expect(triggerA.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(screen.getByTestId('portal-b-filter-regex-toggle'));
    expect(triggerB.getAttribute('aria-expanded')).toBe('true');

    fireEvent.pointerDown(document.body);
    expect(triggerB.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(triggerA);
    fireEvent.click(screen.getByTestId('portal-a-filter-regex-toggle'));
    const popoverA = screen.getByTestId('portal-a-filter-regex-popover');
    const marker = popoverA.getAttribute('data-focus-scope');
    const unrelated = document.createElement('button');
    unrelated.type = 'button';
    unrelated.setAttribute('data-focus-scope', marker ?? 'copied-marker');
    unrelated.setAttribute('data-file-viewer-menu-builder', marker ?? 'copied-marker');
    document.body.appendChild(unrelated);

    // A copied public marker is diagnostic data, not proof of ownership.
    dispatchWithoutComposedPath(unrelated, 'pointerdown');
    expect(triggerA.getAttribute('aria-expanded')).toBe('false');
    unrelated.remove();
  });

  it('does not preserve a stale portal root across unmount and remount', () => {
    const { unmount } = render(
      <CustomSelect
        testId="portal-remount"
        ariaLabel="Provider"
        value="openai"
        options={[{ value: 'openai', label: 'OpenAI' }]}
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('portal-remount'));
    fireEvent.click(screen.getByTestId('portal-remount-filter-regex-toggle'));
    const staleRoot = screen.getByTestId('portal-remount-filter-regex-popover');
    unmount();

    render(
      <CustomSelect
        testId="portal-remount"
        ariaLabel="Provider"
        value="openai"
        options={[{ value: 'openai', label: 'OpenAI' }]}
        onChange={() => {}}
      />,
    );
    const trigger = screen.getByTestId('portal-remount');
    fireEvent.click(trigger);
    fireEvent.click(screen.getByTestId('portal-remount-filter-regex-toggle'));
    const currentRoot = screen.getByTestId('portal-remount-filter-regex-popover');
    staleRoot.setAttribute('data-focus-scope', currentRoot.getAttribute('data-focus-scope') ?? 'copied-marker');
    staleRoot.setAttribute('data-file-viewer-menu-builder', currentRoot.getAttribute('data-focus-scope') ?? 'copied-marker');
    document.body.appendChild(staleRoot);

    dispatchWithoutComposedPath(staleRoot, 'mousedown');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    staleRoot.remove();
  });
});
