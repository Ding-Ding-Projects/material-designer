// @vitest-environment jsdom

import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { RegexSearchField } from '../../../src/components/regex/RegexSearchField';
import { useRegexSearch } from '../../../src/components/regex/useRegexSearch';

afterEach(cleanup);

const ROWS = ['alpha', 'beta', 'Gamma', 'alpine'];

function Field({ testId, initial = '' }: { testId: string; initial?: string }) {
  const [query, setQuery] = useState(initial);
  const search = useRegexSearch(query, setQuery);
  return (
    <div>
      <RegexSearchField
        search={search}
        fieldLabel="Examples"
        testId={testId}
        placeholder="Search"
      />
      <output data-testid={`${testId}-results`}>{ROWS.filter(search.matches).join(',')}</output>
    </div>
  );
}

function openBuilder(testId: string) {
  fireEvent.click(screen.getByTestId(`${testId}-regex-toggle`));
  return screen.getByTestId(`${testId}-regex-popover`);
}

function enableRegex(testId: string) {
  const popover = openBuilder(testId);
  fireEvent.click(within(popover).getByTestId(`${testId}-regex-mode-regex`));
  return popover;
}

describe('RegexSearchField — plain text is the default', () => {
  it('matches plain text, case-insensitively, with no pattern semantics', () => {
    render(<Field testId="a" />);
    const input = screen.getByTestId('a');
    fireEvent.change(input, { target: { value: 'AL' } });
    expect(screen.getByTestId('a-results').textContent).toBe('alpha,alpine');
    expect(input.getAttribute('data-regex-mode')).toBe('text');
  });

  it('treats a regex metacharacter as an ordinary character until regex is on', () => {
    render(<Field testId="a" />);
    fireEvent.change(screen.getByTestId('a'), { target: { value: 'a.p' } });
    // `a.p` would match "alp" as a pattern; as text it matches nothing here.
    expect(screen.getByTestId('a-results').textContent).toBe('');
  });

  it('shows every row while the query is empty', () => {
    render(<Field testId="a" />);
    expect(screen.getByTestId('a-results').textContent).toBe(ROWS.join(','));
  });
});

describe('RegexSearchField — the builder popover', () => {
  it('is closed until the affordance is used', () => {
    render(<Field testId="a" />);
    expect(screen.queryByTestId('a-regex-popover')).toBeNull();
    expect(screen.getByTestId('a-regex-toggle').getAttribute('aria-expanded')).toBe('false');
  });

  it('opens anchored to its own field and reports itself as a dialog', () => {
    render(<Field testId="a" />);
    const popover = openBuilder('a');
    expect(popover.getAttribute('role')).toBe('dialog');
    expect(screen.getByTestId('a-regex-toggle').getAttribute('aria-expanded')).toBe('true');
    expect(popover.style.position).toBe('fixed');
  });

  it('closes on Escape and gives focus back to the field', () => {
    render(<Field testId="a" />);
    const popover = openBuilder('a');
    fireEvent.keyDown(popover, { key: 'Escape' });
    expect(screen.queryByTestId('a-regex-popover')).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId('a'));
  });

  it('closes on Escape pressed in the field itself, without clearing the query', () => {
    render(<Field testId="a" initial="beta" />);
    openBuilder('a');
    fireEvent.keyDown(screen.getByTestId('a'), { key: 'Escape' });
    expect(screen.queryByTestId('a-regex-popover')).toBeNull();
    expect((screen.getByTestId('a') as HTMLInputElement).value).toBe('beta');
  });

  it('closes again when the affordance is used a second time', () => {
    render(<Field testId="a" />);
    openBuilder('a');
    fireEvent.click(screen.getByTestId('a-regex-toggle'));
    expect(screen.queryByTestId('a-regex-popover')).toBeNull();
  });

  it('closes when a pointer lands outside the field and the popover', () => {
    render(<Field testId="a" />);
    openBuilder('a');
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('a-regex-popover')).toBeNull();
  });

  it('offers no pattern editing until regex is explicitly turned on', () => {
    render(<Field testId="a" />);
    const popover = openBuilder('a');
    expect(within(popover).queryByTestId('a-regex-pattern')).toBeNull();
    expect(within(popover).getByTestId('a-regex-enable-regex')).toBeTruthy();
  });
});

describe('RegexSearchField — opting into a pattern', () => {
  it('switches the field to pattern matching and applies it', () => {
    render(<Field testId="a" initial="^al" />);
    enableRegex('a');
    expect(screen.getByTestId('a').getAttribute('data-regex-mode')).toBe('regex');
    expect(screen.getByTestId('a-results').textContent).toBe('alpha,alpine');
  });

  it('keeps the raw editor and the field showing one pattern', () => {
    render(<Field testId="a" />);
    const popover = enableRegex('a');
    fireEvent.change(within(popover).getByTestId('a-regex-pattern'), {
      target: { value: 'a$' },
    });
    expect((screen.getByTestId('a') as HTMLInputElement).value).toBe('a$');
    expect(screen.getByTestId('a-results').textContent).toBe('alpha,beta,Gamma');
  });

  it('builds a pattern from a guided part and writes it into the field', () => {
    render(<Field testId="a" />);
    const popover = enableRegex('a');
    fireEvent.click(within(popover).getByTestId('a-regex-add-anchor'));
    expect((screen.getByTestId('a') as HTMLInputElement).value).toBe('^');
  });

  it('escapes the typed text on request, so it matches literally', () => {
    render(<Field testId="a" initial="a.p" />);
    const popover = enableRegex('a');
    fireEvent.click(within(popover).getByTestId('a-regex-escape-literal'));
    expect((screen.getByTestId('a') as HTMLInputElement).value).toBe('a\\.p');
    expect(screen.getByTestId('a-results').textContent).toBe('');
  });

  it('honours a flag toggle', () => {
    render(<Field testId="a" initial="^a" />);
    const popover = enableRegex('a');
    expect(screen.getByTestId('a-results').textContent).toBe('alpha,alpine');
    // `i` is on by default because plain-text search is case-insensitive;
    // turning it off has to change what matches.
    fireEvent.click(within(popover).getByTestId('a-regex-flag-i'));
    fireEvent.change(within(popover).getByTestId('a-regex-pattern'), {
      target: { value: '^[Gg]' },
    });
    expect(screen.getByTestId('a-results').textContent).toBe('Gamma');
  });
});

describe('RegexSearchField — invalid patterns', () => {
  it('shows the engine error and keeps searching with the last valid pattern', () => {
    render(<Field testId="a" initial="^al" />);
    const popover = enableRegex('a');
    expect(screen.getByTestId('a-results').textContent).toBe('alpha,alpine');

    fireEvent.change(within(popover).getByTestId('a-regex-pattern'), {
      target: { value: '^al[' },
    });
    expect(screen.getByTestId('a-regex-error')).toBeTruthy();
    // The half-typed class did not wipe the list out from under the user.
    expect(screen.getByTestId('a-results').textContent).toBe('alpha,alpine');
  });

  it('recovers once the pattern is valid again', () => {
    render(<Field testId="a" initial="^al" />);
    const popover = enableRegex('a');
    const pattern = within(popover).getByTestId('a-regex-pattern');
    fireEvent.change(pattern, { target: { value: '^al[' } });
    fireEvent.change(pattern, { target: { value: '^be' } });
    expect(screen.queryByTestId('a-regex-error')).toBeNull();
    expect(screen.getByTestId('a-results').textContent).toBe('beta');
  });

  it('shows every row rather than none when there is no usable pattern at all', () => {
    render(<Field testId="a" />);
    const popover = enableRegex('a');
    fireEvent.change(within(popover).getByTestId('a-regex-pattern'), { target: { value: '[' } });
    expect(screen.getByTestId('a-results').textContent).toBe(ROWS.join(','));
  });
});

describe('RegexSearchField — the guided parts stay honest', () => {
  it('says so when a pattern is beyond what the parts can hold, and keeps it', () => {
    render(<Field testId="a" />);
    const popover = enableRegex('a');
    fireEvent.change(within(popover).getByTestId('a-regex-pattern'), {
      target: { value: '(?=alp)a' },
    });
    expect(within(popover).getByTestId('a-regex-out-of-sync')).toBeTruthy();
    // Kept exactly as typed, and still doing the searching.
    expect((screen.getByTestId('a') as HTMLInputElement).value).toBe('(?=alp)a');
    expect(screen.getByTestId('a-results').textContent).toBe('alpha,alpine');
  });

  it('only discards the typed pattern when the user asks it to', () => {
    render(<Field testId="a" />);
    const popover = enableRegex('a');
    const pattern = within(popover).getByTestId('a-regex-pattern');
    fireEvent.change(pattern, { target: { value: '(?=alp)a' } });
    fireEvent.click(within(popover).getByTestId('a-regex-rebuild-parts'));
    expect((screen.getByTestId('a') as HTMLInputElement).value).toBe('');
    expect(screen.queryByTestId('a-regex-out-of-sync')).toBeNull();
  });

  it('re-derives the parts when a representable pattern is typed', () => {
    render(<Field testId="a" />);
    const popover = enableRegex('a');
    fireEvent.change(within(popover).getByTestId('a-regex-pattern'), {
      target: { value: '^ab+' },
    });
    // start anchor, literal a, literal b+
    expect(within(popover).getAllByTestId(/^regex-part-\d+$/)).toHaveLength(3);
  });
});

describe('RegexSearchField — every field owns its own builder', () => {
  it('does not leak mode, pattern or flags from one field to another', () => {
    render(
      <>
        <Field testId="a" initial="^al" />
        <Field testId="b" initial="a.p" />
      </>,
    );

    enableRegex('a');
    fireEvent.keyDown(screen.getByTestId('a-regex-popover'), { key: 'Escape' });

    expect(screen.getByTestId('a').getAttribute('data-regex-mode')).toBe('regex');
    expect(screen.getByTestId('b').getAttribute('data-regex-mode')).toBe('text');
    expect(screen.getByTestId('a-results').textContent).toBe('alpha,alpine');
    // Field B is still plain text, so its `a.p` matches nothing.
    expect(screen.getByTestId('b-results').textContent).toBe('');
  });

  it('opens a separate popover per field', () => {
    render(
      <>
        <Field testId="a" />
        <Field testId="b" />
      </>,
    );
    openBuilder('a');
    expect(screen.queryByTestId('b-regex-popover')).toBeNull();
    expect(screen.getByTestId('a-regex-popover')).toBeTruthy();
  });
});
