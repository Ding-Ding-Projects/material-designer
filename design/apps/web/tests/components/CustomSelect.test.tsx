// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomSelect, type LockedActivationRequest, type LockedActivationReceipt } from '../../src/components/CustomSelect';

vi.mock('../../src/components/regex', () => ({
  RegexSearchField: ({ search, testId, ariaLabel, ariaControls, placeholder }: {
    search: { query: string; setQuery: (next: string) => void };
    testId?: string;
    ariaLabel?: string;
    ariaControls?: string;
    placeholder?: string;
  }) => (
    <input
      type="search"
      aria-label={ariaLabel}
      aria-controls={ariaControls}
      placeholder={placeholder}
      data-testid={testId}
      data-regex-mode="text"
      value={search.query}
      onChange={(event) => search.setQuery(event.target.value)}
    />
  ),
  useRegexSearch: (query: string, setQuery: (next: string) => void) => ({
    query,
    setQuery,
    mode: 'text' as const,
    setMode: vi.fn(),
    flags: '',
    toggleFlag: vi.fn(),
    parts: [],
    applyParts: vi.fn(),
    syncFailure: null,
    rebuildFromParts: vi.fn(),
    escapeQueryAsLiteral: vi.fn(),
    error: null,
    usingLastValid: false,
    regex: null,
    matches: (text: string) => !query.trim() || text.toLowerCase().includes(query.trim().toLowerCase()),
    sample: '',
    setSample: vi.fn(),
  }),
}));

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
});
