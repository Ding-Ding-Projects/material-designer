// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Switch } from '../../src/components/Switch';

/**
 * The Material Design 3 switch (roadmap § 2.4 Wave 4).
 *
 * What is worth pinning here is the semantics rather than the pixels — the
 * pixels are pinned in `tests/styles/lists-and-switches-m3.test.ts`. Five
 * places in this codebase drew a toggle as a `<label>` wrapping a checkbox,
 * which assistive technology announces as "checked"/"not checked" and which
 * gives the host no way to refuse a change the server rejected. This one is
 * a `role="switch"` button that reports `aria-checked` and never toggles
 * itself.
 */

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Switch', () => {
  it('is a switch with an accessible name and a reported state', () => {
    render(<Switch checked={false} onChange={() => {}} label="Morning briefing enabled" />);
    const control = screen.getByRole('switch', { name: 'Morning briefing enabled' });
    expect(control.getAttribute('aria-checked')).toBe('false');
    expect(control.tagName).toBe('BUTTON');
    // A `type` other than `submit` matters: these switches sit inside forms
    // (the automations editor is one) and the default would submit them.
    expect(control.getAttribute('type')).toBe('button');
  });

  it('asks for the OTHER value rather than toggling itself', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Switch checked={false} onChange={onChange} label="Enabled" />,
    );
    const control = screen.getByRole('switch', { name: 'Enabled' });

    fireEvent.click(control);
    expect(onChange).toHaveBeenCalledWith(true);
    // Still off. The host owns the state, so a request the daemon refuses
    // leaves the control telling the truth instead of showing a value that
    // was never persisted.
    expect(control.getAttribute('aria-checked')).toBe('false');

    rerender(<Switch checked onChange={onChange} label="Enabled" />);
    expect(
      screen.getByRole('switch', { name: 'Enabled' }).getAttribute('aria-checked'),
    ).toBe('true');
    fireEvent.click(screen.getByRole('switch', { name: 'Enabled' }));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('is keyboard-operable through the platform, not a key handler', () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Enabled" />);
    const control = screen.getByRole('switch', { name: 'Enabled' });

    // A real <button> is focusable without a tabindex and fires `click` on
    // Space and Enter. jsdom does not synthesize that activation, so the
    // assertion is that the element is the kind that gets it for free: no
    // `tabindex` override, and focusable.
    expect(control.getAttribute('tabindex')).toBeNull();
    control.focus();
    expect(document.activeElement).toBe(control);
  });

  /**
   * The five hand-rolled toggles this component replaced were a `<label>`
   * wrapping a checkbox, and three of those labels carried a `title` — a
   * hover tooltip on a control with no adjacent text. Dropping it in the
   * migration was a real regression, so the prop exists and is passed at the
   * call sites that had one. It is opt-in rather than derived from `label`:
   * a switch sitting beside a name that already reads "Morning briefing"
   * does not want a tooltip repeating it.
   */
  it('carries a tooltip only when the caller asks for one', () => {
    const { rerender } = render(
      <Switch checked onChange={() => {}} label="Toggle" />,
    );
    expect(
      screen.getByRole('switch', { name: 'Toggle' }).getAttribute('title'),
    ).toBeNull();

    rerender(<Switch checked onChange={() => {}} label="Toggle" title="Toggle" />);
    expect(
      screen.getByRole('switch', { name: 'Toggle' }).getAttribute('title'),
    ).toBe('Toggle');
  });

  it('refuses interaction when disabled', () => {
    const onChange = vi.fn();
    render(<Switch checked onChange={onChange} label="Enabled" disabled />);
    const control = screen.getByRole('switch', { name: 'Enabled' });
    expect((control as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(control);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders the icon variant only when asked, and hides it from the name', () => {
    const { rerender } = render(
      <Switch checked onChange={() => {}} label="Enabled" />,
    );
    let control = screen.getByRole('switch', { name: 'Enabled' });
    expect(control.getAttribute('data-with-icons')).toBe('false');
    expect(control.querySelector('[data-symbol]')).toBeNull();

    rerender(<Switch checked onChange={() => {}} label="Enabled" withIcons />);
    control = screen.getByRole('switch', { name: 'Enabled' });
    expect(control.getAttribute('data-with-icons')).toBe('true');
    expect(control.querySelector('[data-symbol]')).not.toBeNull();
    // The glyph duplicates what `aria-checked` already says, so it must not
    // reach the accessibility tree.
    expect(control.querySelector('[aria-hidden="true"]')).not.toBeNull();
    // …and the name is unchanged by the variant.
    expect(control.getAttribute('aria-label')).toBe('Enabled');
  });
});
