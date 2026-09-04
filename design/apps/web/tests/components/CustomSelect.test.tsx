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

const SEARCH_PROPS = {
  searchLabel: 'Options',
  searchPlaceholder: 'Filter options',
  noResultsLabel: 'No options match this filter.',
  resultCountLabel: (count: number) => `${count} options`,
  duplicateOptionLabel: 'This option is unavailable.',
  disabledOptionLabel: 'This option is disabled.',
  lockedReason: 'Unlock this control first.',
  onLockedActivate: (request: LockedActivationRequest): LockedActivationReceipt => ({
    targetId: request.targetId,
    phase: 'requested',
  }),
};

describe('CustomSelect', () => {
  it('renders the selected label and chooses an option from the portal menu', () => {
    const onChange = vi.fn();
    render(
      <CustomSelect
        {...SEARCH_PROPS}
        testId="model"
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
        {...SEARCH_PROPS}
        testId="provider"
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
        {...SEARCH_PROPS}
        testId="template"
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
        {...SEARCH_PROPS}
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

  it('closes on Tab without cancelling the browser focus transition', () => {
    render(
      <CustomSelect ariaLabel="Provider" value="openai" options={[{ value: 'openai', label: 'OpenAI' }, { value: 'custom', label: 'Custom' }]} onChange={vi.fn()} />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Provider: OpenAI' });
    fireEvent.click(trigger);
    const allowedDefault = fireEvent.keyDown(trigger, { key: 'Tab' });

    expect(allowedDefault).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes when the trigger blurs to an outside element', () => {
    render(
      <CustomSelect ariaLabel="Provider" value="openai" options={[{ value: 'openai', label: 'OpenAI' }, { value: 'custom', label: 'Custom' }]} onChange={vi.fn()} />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Provider: OpenAI' });
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    fireEvent.click(trigger);
    fireEvent.blur(trigger, { relatedTarget: outside });

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    outside.remove();
  });

  it('positions a portal menu from the bottom edge when it opens above the trigger', () => {
    render(
      <CustomSelect ariaLabel="Provider" value="openai" options={[{ value: 'openai', label: 'OpenAI' }, { value: 'custom', label: 'Custom' }]} onChange={vi.fn()} />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Provider: OpenAI' });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 });
    Object.defineProperty(trigger, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 500, bottom: 540, left: 20, width: 200, right: 220, height: 40 }),
    });

    fireEvent.click(trigger);
    const menu = screen.getByRole('listbox');

    expect(menu.style.bottom).toBe('104px');
    expect(menu.style.top).toBe('');
  });
});
