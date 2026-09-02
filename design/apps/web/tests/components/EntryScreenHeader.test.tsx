// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EntryScreenHeader } from '../../src/components/EntryScreenHeader';
import { I18nProvider } from '../../src/i18n';
import type { AppConfig } from '../../src/types';

vi.mock('../../src/state/appearance', () => ({
  applyAppearanceToDocument: vi.fn(),
}));

const config = { theme: 'system' } as unknown as AppConfig;

function renderHeader(view: Parameters<typeof EntryScreenHeader>[0]['view'], overrides: Partial<Parameters<typeof EntryScreenHeader>[0]> = {}) {
  const onConfigPersist = vi.fn();
  const onOpenSettings = vi.fn();
  render(
    <I18nProvider initial="en">
      <EntryScreenHeader
        view={view}
        config={config}
        onConfigPersist={onConfigPersist}
        onOpenSettings={onOpenSettings}
        {...overrides}
      />
    </I18nProvider>,
  );
  return { onConfigPersist, onOpenSettings };
}

afterEach(() => {
  cleanup();
});

describe('EntryScreenHeader', () => {
  it('names the screen, mounts the search pill, the bell, the theme toggle and the avatar', () => {
    renderHeader('home');
    expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toBeTruthy();
    expect(screen.getByTestId('entry-topbar-search')).toBeTruthy();
    expect(screen.getByTestId('message-center-trigger')).toBeTruthy();
    expect(screen.getByTestId('entry-screen-header-theme')).toBeTruthy();
    expect(screen.getByTestId('entry-screen-header-account')).toBeTruthy();
  });

  it('leaves the title to a section that already carries its own <h1>', () => {
    renderHeader('projects');
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.getByTestId('entry-screen-header').getAttribute('data-view')).toBe('projects');
  });

  it('renders nothing during onboarding', () => {
    renderHeader('onboarding');
    expect(screen.queryByTestId('entry-screen-header')).toBeNull();
  });

  it('cycles the theme system → light → dark and persists through the app writer', () => {
    const { onConfigPersist } = renderHeader('home');
    const toggle = screen.getByTestId('entry-screen-header-theme');
    expect(toggle.getAttribute('data-theme-choice')).toBe('system');
    fireEvent.click(toggle);
    expect(onConfigPersist).toHaveBeenCalledWith(expect.objectContaining({ theme: 'light' }));
  });

  it('opens settings from the avatar', () => {
    const { onOpenSettings } = renderHeader('home');
    fireEvent.click(screen.getByTestId('entry-screen-header-account'));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});
