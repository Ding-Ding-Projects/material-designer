// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomSelect } from '../../src/components/CustomSelect';

afterEach(() => cleanup());

describe('CustomSelect', () => {
  it('renders the selected label and chooses an option from the portal menu', () => {
    const onChange = vi.fn();
    render(
      <CustomSelect
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

  it('gives every opened dropdown an isolated search field and anchored builder', () => {
    const onChange = vi.fn();
    render(
      <CustomSelect
        testId="format"
        ariaLabel="Format"
        value="json"
        options={[
          { value: 'json', label: 'JSON' },
          { value: 'yaml', label: 'YAML' },
          { value: 'xml', label: 'XML' },
        ]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByTestId('format'));
    const filter = screen.getByTestId('format-filter');
    expect(document.activeElement).toBe(filter);
    expect(screen.getByTestId('format-filter-regex-toggle')).toBeTruthy();

    fireEvent.change(filter, { target: { value: 'yaml' } });
    expect(screen.getByRole('option', { name: 'YAML' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'JSON' })).toBeNull();
    expect(filter.getAttribute('data-regex-mode')).toBe('text');

    fireEvent.change(filter, { target: { value: 'missing' } });
    expect(screen.getByTestId('format-no-results')).toHaveTextContent('No options match');
  });

  it('uses the same active-option path for filtered keyboard selection', () => {
    const onChange = vi.fn();
    render(
      <CustomSelect
        testId="engine"
        ariaLabel="Engine"
        value="one"
        options={[
          { value: 'one', label: 'One' },
          { value: 'two', label: 'Two' },
          { value: 'three', label: 'Three' },
        ]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByTestId('engine'));
    const filter = screen.getByTestId('engine-filter');
    fireEvent.change(filter, { target: { value: 't' } });
    expect(filter.getAttribute('aria-activedescendant')).toBe(
      screen.getByRole('option', { name: 'Two' }).id,
    );
    fireEvent.keyDown(filter, { key: 'ArrowDown' });
    expect(filter.getAttribute('aria-activedescendant')).toBe(
      screen.getByRole('option', { name: 'Three' }).id,
    );
    fireEvent.keyDown(filter, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('three');
    expect(document.activeElement).toBe(screen.getByTestId('engine'));
  });

  it('returns focus to the trigger when the dropdown is dismissed', () => {
    render(
      <CustomSelect
        testId="dismiss"
        ariaLabel="Dismiss"
        value="one"
        options={[{ value: 'one', label: 'One' }]}
        onChange={() => {}}
      />,
    );
    const trigger = screen.getByTestId('dismiss');
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByTestId('dismiss-filter'), { key: 'Escape' });
    expect(document.activeElement).toBe(trigger);
  });
});
