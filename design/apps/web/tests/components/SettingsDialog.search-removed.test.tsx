// @vitest-environment jsdom
//
// The Settings page owns one searchable tab strip. Search remains plain text
// by default, with the same field's adjacent regex builder available as an
// explicit opt-in; the tab strip remains the single navigation owner.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SettingsDialog } from '../../src/components/SettingsDialog';
import { SETTINGS_TAB_ORDER } from '../../src/components/settings/settingsTabs';
import { DEFAULT_CONFIG } from '../../src/state/config';
import type { AgentInfo } from '../../src/types';

const AGENTS: AgentInfo[] = [{ id: 'codex', name: 'Codex', bin: 'codex', available: true }];

function renderSettingsPage() {
  return render(
    <SettingsDialog
      presentation="page"
      initial={{ ...DEFAULT_CONFIG }}
      agents={AGENTS}
      daemonLive
      appVersionInfo={null}
      initialSection="execution"
      onPersist={vi.fn()}
      onPersistComposioKey={vi.fn()}
      onClose={vi.fn()}
      onRefreshAgents={vi.fn()}
    />,
  );
}

describe('SettingsDialog settings-tab search', () => {
  afterEach(cleanup);

  it('renders the settings search field with its own regex builder', () => {
    renderSettingsPage();

    const search = screen.getByTestId('settings-search');
    expect(search.getAttribute('data-regex-mode')).toBe('text');
    expect(screen.getByTestId('settings-search-regex-toggle')).toBeTruthy();
  });

  it('keeps the back-to-home affordance and every visible settings tab reachable', () => {
    const { container } = renderSettingsPage();

    expect(container.querySelector('.settings-page-back')).not.toBeNull();
    expect(screen.getAllByRole('tab')).toHaveLength(SETTINGS_TAB_ORDER.length);
  });

  it('searches and teleports to the Appearance tab without raw identifiers', () => {
    renderSettingsPage();

    fireEvent.change(screen.getByTestId('settings-search'), { target: { value: 'appearance' } });
    const result = screen.getByTestId('settings-search-results');
    const row = result.querySelector<HTMLButtonElement>('[data-anchor="appearance.theme"]');
    expect(row).toBeTruthy();
    fireEvent.click(row as HTMLButtonElement);

    expect(screen.getByRole('tab', { name: 'Appearance' }).getAttribute('aria-selected')).toBe('true');
  });
});
