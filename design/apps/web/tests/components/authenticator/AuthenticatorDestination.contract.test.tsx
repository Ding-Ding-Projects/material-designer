// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { AuthenticatorDestination } from '../../../src/components/authenticator/AuthenticatorDestination';

describe('authenticator destination surface', () => {
  test('starts with accessible tabbed empty state and a local file input', () => {
    render(<AuthenticatorDestination />);
    expect(screen.getByTestId('authenticator-destination')).toBeTruthy();
    expect(screen.getByRole('tablist')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Codes' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Register an entry' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Register an entry' }));
    expect(screen.getByLabelText('Load a local QR image or otpauth JSON')).toHaveAttribute('accept', expect.stringContaining('image/*'));
    expect(screen.getByRole('button', { name: 'Read clipboard QR' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Use camera QR' })).toBeTruthy();
  });
});
