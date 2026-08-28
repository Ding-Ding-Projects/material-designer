// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import * as React from 'react';

import { RegexSearchField } from '../../../src/components/regex/RegexSearchField';
import { useRegexSearch } from '../../../src/components/regex/useRegexSearch';

function Field() {
  const [query, setQuery] = React.useState('(?<word>cat)');
  const search = useRegexSearch(query, setQuery);
  return <RegexSearchField search={search} fieldLabel="Workbench" testId="workbench" />;
}

function openRegexBuilder() {
  fireEvent.click(screen.getByTestId('workbench-regex-toggle'));
  const popover = screen.getByTestId('workbench-regex-popover');
  fireEvent.click(within(popover).getByTestId('workbench-regex-mode-regex'));
  return screen.getByTestId('workbench-regex-popover');
}

describe('RegexWorkbenchPanels', () => {
  afterEach(cleanup);

  it('renders the engine matrix, token annotations, and unsupported reasons', () => {
    render(<Field />);
    const popover = openRegexBuilder();
    expect(within(popover).getByTestId('workbench-regex-workbench-capabilities')).toBeTruthy();
    expect(within(popover).getByText('Atomic groups')).toBeTruthy();
    expect(within(popover).getByTestId('workbench-regex-workbench-tokens')).toBeTruthy();
    expect(within(popover).getByText(/Named capture word: Captures text/)).toBeTruthy();
  });

  it('keeps replacement preview tied to the compiled pattern and sample', () => {
    render(<Field />);
    const popover = openRegexBuilder();
    fireEvent.change(within(popover).getByTestId('workbench-regex-sample-input'), {
      target: { value: 'cat cat' },
    });
    fireEvent.change(within(popover).getByTestId('workbench-regex-workbench-replacement'), {
      target: { value: '[$<word>]' },
    });
    expect(within(popover).getByTestId('workbench-regex-workbench-replacement-preview').textContent).toBe('[cat] [cat]');
    expect(within(popover).getByTestId('workbench-regex-workbench-replacement-status').textContent).toContain('2 replacement');
  });

  it('offers supported advanced syntax as guided inserts into the same raw field', () => {
    render(<Field />);
    const popover = openRegexBuilder();
    const inserts = within(popover).getByTestId('workbench-regex-workbench-advanced-constructs');
    fireEvent.click(within(inserts).getByRole('button', { name: 'Lookahead and lookbehind' }));
    expect((screen.getByTestId('workbench') as HTMLInputElement).value).toContain('(?<=USD)\\d+');
  });

  it('saves a named snippet without including sample text', () => {
    render(<Field />);
    const popover = openRegexBuilder();
    fireEvent.change(within(popover).getByTestId('workbench-regex-workbench-snippet-name'), {
      target: { value: 'Cats' },
    });
    fireEvent.click(within(popover).getByTestId('workbench-regex-workbench-snippet-save'));
    expect(within(popover).getByTestId('workbench-regex-workbench-snippet-list').textContent).toContain('Cats');
  });
});
