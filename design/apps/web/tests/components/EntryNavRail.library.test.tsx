// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EntryNavRail } from '../../src/components/EntryNavRail';
import { I18nProvider } from '../../src/i18n';

vi.mock('../../src/analytics/provider', () => ({
  useAnalytics: () => ({
    track: vi.fn(),
    newRequestId: vi.fn(() => 'library-nav-request'),
  }),
}));

afterEach(cleanup);

describe('EntryNavRail Library destination', () => {
  it('exposes the real Library route to signed-out/local users', () => {
    const onViewChange = vi.fn();
    render(
      <I18nProvider initial="en">
        <EntryNavRail
          view="home"
          onViewChange={onViewChange}
          onNewProject={() => {}}
          open
          context={null}
        />
      </I18nProvider>,
    );

    const library = screen.getByTestId('entry-nav-library');
    expect(library).toHaveAttribute('aria-label', 'Library');
    fireEvent.click(library);
    expect(onViewChange).toHaveBeenCalledWith('library');
  });

  it('marks Library active without replacing its real component route', () => {
    render(
      <I18nProvider initial="en">
        <EntryNavRail
          view="library"
          onViewChange={() => {}}
          onNewProject={() => {}}
          open
          context={null}
        />
      </I18nProvider>,
    );

    expect(screen.getByTestId('entry-nav-library')).toHaveAttribute('aria-current', 'page');
  });
});
