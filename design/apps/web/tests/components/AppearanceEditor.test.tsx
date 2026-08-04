// @vitest-environment jsdom

// The appearance editor was written, shipped in the bundle, and imported by
// nothing — a control nobody could reach. These specs pin the two halves of
// the wire-up so it cannot quietly come loose again: the infinite picker is
// on the accent field, and the runtime applies what the store persisted.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppearanceRuntime } from '../../src/components/appearance/AppearanceRuntime';
import { InfiniteColorPicker } from '../../src/components/appearance/InfiniteColorPicker';
import {
  resetAppearancePreferencesCache,
  setAppearancePreferences,
} from '../../src/components/appearance/store';
import type { Rgb, Rgba } from '../../src/components/appearance/color';
import { DEFAULT_APPEARANCE_PREFERENCES } from '../../src/state/appearance';
import { SettingsDialog } from '../../src/components/SettingsDialog';
import { fetchConnectors, fetchDesignTemplates, fetchSkills } from '../../src/providers/registry';
import type { AppConfig } from '../../src/types';

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    fetchConnectors: vi.fn(),
    fetchDesignTemplates: vi.fn(),
    fetchSkills: vi.fn(),
  };
});

const originalFetch = globalThis.fetch;

const WHITE: Rgb = { r: 255, g: 255, b: 255 };

function clearAppliedAppearance(): void {
  const root = document.documentElement;
  root.removeAttribute('data-seed');
  root.removeAttribute('data-density');
  root.style.removeProperty('--od-scale');
  root.style.removeProperty('--od-css-zoom');
  root.style.removeProperty('zoom');
  root.style.removeProperty('--accent');
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  resetAppearancePreferencesCache();
  clearAppliedAppearance();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('InfiniteColorPicker', () => {
  it('reaches a colour no swatch list contains, from typed entry', () => {
    const onChange = vi.fn<(next: Rgba) => void>();
    render(
      <InfiniteColorPicker
        value={{ r: 0xc9, g: 0x64, b: 0x42, a: 1 }}
        onChange={onChange}
        label="Custom color"
        background={WHITE}
      />,
    );

    fireEvent.change(screen.getByTestId('appearance-color-entry'), {
      target: { value: '#2563eb' },
    });

    expect(onChange).toHaveBeenCalled();
    const emitted = onChange.mock.calls.at(-1)?.[0];
    expect(emitted).toBeDefined();
    // The picker keeps HSVA and emits RGBA, so the round trip is compared at
    // the resolution the accent is actually stored at.
    expect(Math.round(emitted?.r ?? -1)).toBe(0x25);
    expect(Math.round(emitted?.g ?? -1)).toBe(0x63);
    expect(Math.round(emitted?.b ?? -1)).toBe(0xeb);
  });

  it('keeps invalid entry on screen instead of snapping the field back', () => {
    const onChange = vi.fn<(next: Rgba) => void>();
    render(
      <InfiniteColorPicker
        value={{ r: 0, g: 0, b: 0, a: 1 }}
        onChange={onChange}
        label="Custom color"
        background={WHITE}
      />,
    );

    const entry = screen.getByTestId('appearance-color-entry') as HTMLInputElement;
    fireEvent.change(entry, { target: { value: 'rgb(12,' } });

    expect(entry.value).toBe('rgb(12,');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('AppearanceRuntime', () => {
  it('applies the persisted appearance to the document when it mounts', () => {
    setAppearancePreferences({
      ...DEFAULT_APPEARANCE_PREFERENCES,
      seed: 'teal',
      density: 'compact',
      uiScale: 1.25,
    });
    // Drop everything the write above applied, then force a fresh read from
    // storage, so what the assertions see can only have come from the mount.
    clearAppliedAppearance();
    resetAppearancePreferencesCache();

    render(<AppearanceRuntime />);

    expect(document.documentElement.getAttribute('data-seed')).toBe('teal');
    expect(document.documentElement.getAttribute('data-density')).toBe('compact');
    expect(document.documentElement.style.getPropertyValue('--od-scale')).toBe('1.25');
  });
});

const baseConfig: AppConfig = {
  mode: 'api',
  apiKey: 'sk-test',
  apiProtocol: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  agentId: null,
  skillId: null,
  designSystemId: null,
};

describe('Settings: the appearance section', () => {
  beforeEach(() => {
    vi.mocked(fetchConnectors).mockResolvedValue([]);
    vi.mocked(fetchDesignTemplates).mockResolvedValue([]);
    vi.mocked(fetchSkills).mockResolvedValue([]);
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 404 })) as typeof fetch;
  });

  it('offers the continuous colour field, not only the fixed swatches', () => {
    render(
      <SettingsDialog
        initial={baseConfig}
        agents={[]}
        daemonLive
        appVersionInfo={null}
        initialSection="appearance"
        onPersist={vi.fn()}
        onPersistComposioKey={vi.fn()}
        onClose={vi.fn()}
        onRefreshAgents={vi.fn()}
      />,
    );

    expect(screen.getByTestId('appearance-color-field')).toBeTruthy();
    expect(screen.getByTestId('appearance-color-entry')).toBeTruthy();
    // The swatches stay: the picker is the space, they are the shortcuts.
    expect(screen.getByRole('radiogroup', { name: 'Accent color' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Presets' })).toBeTruthy();
  });
});
