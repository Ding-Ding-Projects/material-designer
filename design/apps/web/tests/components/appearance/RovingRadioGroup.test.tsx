// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useState } from 'react';

import { RovingRadioGroup } from '../../../src/components/appearance/RovingRadioGroup';

const OPTIONS = ['sunset', 'violet', 'teal'] as const;

function Harness() {
  const [value, setValue] = useState<(typeof OPTIONS)[number]>('sunset');
  return (
    <RovingRadioGroup
      value={value}
      options={OPTIONS}
      onChange={setValue}
      ariaLabel="Seed"
      optionProps={(option) => ({ 'aria-label': option })}
    >
      {(option) => option}
    </RovingRadioGroup>
  );
}

describe('RovingRadioGroup', () => {
  it('keeps one tab stop and exposes radio state', () => {
    render(<Harness />);

    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'sunset' }).tabIndex).toBe(0);
    expect(screen.getByRole('radio', { name: 'violet' }).tabIndex).toBe(-1);
    expect(screen.getByRole('radio', { name: 'sunset' })).toHaveAttribute('aria-checked', 'true');
  });

  it('moves selection and focus with arrows, Home, and End', () => {
    render(<Harness />);
    const sunset = screen.getByRole('radio', { name: 'sunset' });

    sunset.focus();
    fireEvent.keyDown(sunset, { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: 'violet' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'violet' })).toHaveAttribute('aria-checked', 'true');

    fireEvent.keyDown(screen.getByRole('radio', { name: 'violet' }), { key: 'End' });
    expect(screen.getByRole('radio', { name: 'teal' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'teal' })).toHaveAttribute('aria-checked', 'true');

    fireEvent.keyDown(screen.getByRole('radio', { name: 'teal' }), { key: 'Home' });
    expect(screen.getByRole('radio', { name: 'sunset' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'sunset' })).toHaveAttribute('aria-checked', 'true');
  });
});
