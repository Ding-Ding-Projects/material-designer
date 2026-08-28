// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomSelect, type LockedActivationRequest, type LockedActivationReceipt } from '../../src/components/CustomSelect';

afterEach(() => cleanup());

const SEARCH_PROPS = {
  searchLabel: 'Options',
  searchPlaceholder: 'Filter options',
  noResultsLabel: 'No options match this filter.',
  resultCountLabel: (count: number) => `${count} options`,
  lockedReason: 'Unlock this control first.',
  onLockedActivate: (request: LockedActivationRequest): LockedActivationReceipt => ({
    targetId: request.targetId,
    accepted: true,
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

  it('gives every opened dropdown an isolated search field and anchored builder', () => {
    const onChange = vi.fn();
    render(
      <CustomSelect
        {...SEARCH_PROPS}
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
        {...SEARCH_PROPS}
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
        {...SEARCH_PROPS}
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

  it('keeps the portalled regex builder inside its dropdown owner', () => {
    render(
      <CustomSelect
        {...SEARCH_PROPS}
        testId="builder"
        ownerId="builder-owner"
        ariaLabel="Builder"
        value="one"
        options={[{ value: 'one', label: 'One' }]}
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('builder'));
    fireEvent.click(screen.getByTestId('builder-filter-regex-toggle'));
    const popover = screen.getByTestId('builder-filter-regex-popover');
    fireEvent.pointerDown(popover);
    fireEvent.scroll(popover);
    expect(screen.getByTestId('builder-filter-regex-popover')).toBeTruthy();
  });

  it('detects duplicate caller ids instead of silently sharing an option namespace', () => {
    const props = {
      ...SEARCH_PROPS,
      ownerId: 'duplicate-owner',
      ariaLabel: 'Duplicate',
      value: 'one',
      options: [{ value: 'one', label: 'One' }],
      onChange: () => {},
    };
    render(
      <>
        <CustomSelect {...props} testId="duplicate-a" />
        <CustomSelect {...props} testId="duplicate-b" />
      </>,
    );
    expect(screen.getByTestId('duplicate-a')).toHaveAttribute('data-owner-duplicate', 'true');
    expect(screen.getByTestId('duplicate-b')).toHaveAttribute('data-owner-duplicate', 'true');
  });

  it('marks duplicate option values before an ambiguous selection can ship', () => {
    render(
      <CustomSelect
        {...SEARCH_PROPS}
        testId="duplicate-options"
        ariaLabel="Duplicate options"
        value="same"
        options={[{ value: 'same', label: 'First' }, { value: 'same', label: 'Second' }]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId('duplicate-options')).toHaveAttribute('data-option-duplicate', 'true');
  });

  it('refuses duplicate caller option ids even when values differ', () => {
    const onChange = vi.fn();
    render(
      <CustomSelect
        {...SEARCH_PROPS}
        testId="duplicate-ids"
        ariaLabel="Duplicate ids"
        value="one"
        options={[{ id: 'same', value: 'one', label: 'One' }, { id: 'same', value: 'two', label: 'Two' }]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId('duplicate-ids'));
    expect(screen.getByTestId('duplicate-ids')).toHaveAttribute('data-option-duplicate', 'true');
    expect(screen.getByRole('option', { name: /Two/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('option', { name: /Two/ }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('supports touch selection through the same option action', () => {
    const onChange = vi.fn();
    render(
      <CustomSelect
        {...SEARCH_PROPS}
        testId="touch"
        ariaLabel="Touch"
        value="one"
        options={[{ value: 'one', label: 'One' }, { value: 'two', label: 'Two' }]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId('touch'));
    const option = screen.getByRole('option', { name: 'Two' });
    fireEvent.pointerDown(option, { pointerType: 'touch' });
    fireEvent.pointerUp(option, { pointerType: 'touch' });
    fireEvent.click(option);
    expect(onChange).toHaveBeenCalledWith('two');
  });

  it('keeps a locked trigger disabled while its wrapper remains an unlock target', () => {
    const onLockedActivate = vi.fn((request: LockedActivationRequest): LockedActivationReceipt => ({
      targetId: request.targetId,
      accepted: true,
    }));
    const onContextMenu = vi.fn();
    render(
      <CustomSelect
        {...SEARCH_PROPS}
        testId="locked"
        locked
        lockedReason="Unlock this control first."
        onLockedActivate={onLockedActivate}
        onContextMenu={onContextMenu}
        ariaLabel="Locked"
        value="one"
        options={[{ value: 'one', label: 'One' }]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId('locked')).toBeDisabled();
    const wrapper = screen.getByRole('button', { name: 'Locked: locked' });
    fireEvent.pointerDown(wrapper, { pointerType: 'touch' });
    fireEvent.click(wrapper);
    fireEvent.keyDown(wrapper, { key: 'Enter' });
    expect(onLockedActivate).toHaveBeenCalledTimes(2);
    fireEvent.click(wrapper);
    fireEvent.click(wrapper);
    expect(onLockedActivate).toHaveBeenCalledTimes(3);
    expect(onLockedActivate.mock.calls.map(([request]) => request.input)).toEqual([
      'pointer',
      'keyboard',
      'programmatic',
    ]);
    fireEvent.contextMenu(wrapper);
    expect(onContextMenu).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('locked-filter')).toBeNull();
  });

  it('scrolls the active option into view after keyboard movement', () => {
    const scrollIntoView = vi.fn();
    const previous = HTMLElement.prototype.scrollIntoView;
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    try {
      render(
        <CustomSelect
          {...SEARCH_PROPS}
          testId="scroll"
          ariaLabel="Scroll"
          value="one"
          options={[{ value: 'one', label: 'One' }, { value: 'two', label: 'Two' }]}
          onChange={() => {}}
        />,
      );
      fireEvent.click(screen.getByTestId('scroll'));
      fireEvent.keyDown(screen.getByTestId('scroll-filter'), { key: 'ArrowDown' });
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: previous,
      });
    }
  });

  it('recomputes portal bounds without overflow in a tiny viewport', () => {
    const originalWidth = window.innerWidth;
    const originalHeight = window.innerHeight;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 20 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 20 });
    try {
      render(
        <CustomSelect
          {...SEARCH_PROPS}
          testId="tiny"
          ariaLabel="Tiny"
          value="one"
          options={[{ value: 'one', label: 'One' }]}
          onChange={() => {}}
        />,
      );
      fireEvent.click(screen.getByTestId('tiny'));
      const menu = screen.getByRole('listbox');
      expect(Number.parseInt(menu.style.left, 10)).toBeGreaterThanOrEqual(0);
      expect(Number.parseInt(menu.style.left, 10)).toBeLessThanOrEqual(20);
      expect(Number.parseInt(menu.style.top, 10)).toBeGreaterThanOrEqual(0);
      expect(Number.parseInt(menu.style.top, 10)).toBeLessThanOrEqual(20);
      expect(Number.parseInt(menu.style.maxHeight, 10)).toBeGreaterThanOrEqual(1);
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalHeight });
    }
  });
});
