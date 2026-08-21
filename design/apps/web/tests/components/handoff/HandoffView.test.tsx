// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HandoffView } from '../../../src/components/handoff/HandoffView';

describe('HandoffView', () => {
  it('renders two independent searches and the two exact registry counts', () => {
    render(<HandoffView onBack={vi.fn()} />);
    expect(screen.getByTestId('handoff-page')).toBeTruthy();
    expect(screen.getByText('18 token mappings')).toBeTruthy();
    expect(screen.getByText('12 component owners')).toBeTruthy();
    expect(screen.getByTestId('handoff-token-search')).toBeTruthy();
    expect(screen.getByTestId('handoff-component-search')).toBeTruthy();
    expect(screen.getByTestId('handoff-token-search-regex-toggle')).toBeTruthy();
    expect(screen.getByTestId('handoff-component-search-regex-toggle')).toBeTruthy();
  });

  it('selects a row and enables selected exports without inventing destructive actions', () => {
    render(<HandoffView onBack={vi.fn()} />);
    const row = screen.getByTestId('handoff-token-search-row-color-primary-accent');
    fireEvent.click(row);
    expect(screen.getByTestId('handoff-copy-selected')).not.toBeDisabled();
    expect(screen.getByTestId('handoff-export-selected-json')).not.toBeDisabled();
    expect(screen.queryByText(/delete|remove/i)).toBeNull();
  });
});
