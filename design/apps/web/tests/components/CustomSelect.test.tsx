// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomSelect, type LockedActivationRequest, type LockedActivationReceipt } from '../../src/components/CustomSelect';

afterEach(() => cleanup());

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
});
