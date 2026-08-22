// @vitest-environment jsdom
//
// The Appearance settings section owns a persisted System / Light / Dark
// choice. These specs pin the config normalizer, live document application and
// pre-hydration boundary so the three values cannot drift between surfaces.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyAppearanceToDocument, resolveAppTheme } from '../../src/state/appearance';
import { DEFAULT_CONFIG, loadConfig } from '../../src/state/config';
import type { AppConfig } from '../../src/types';

const STORAGE_KEY = 'open-design:config';
const store = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => store.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    store.delete(key);
  }),
  clear: vi.fn(() => {
    store.clear();
  }),
});

function persist(config: Partial<AppConfig>): void {
  store.set(STORAGE_KEY, JSON.stringify(config));
}

/** Pretend the OS is in dark mode, the way a dark-desktop user's browser is. */
function stubSystemPrefersDark(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('prefers-color-scheme: dark'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

describe('appearance theme — persisted config', () => {
  beforeEach(() => {
    store.clear();
  });

  it('defaults a fresh install to the system theme', () => {
    expect(DEFAULT_CONFIG.theme).toBe('system');
    expect(loadConfig().theme).toBe('system');
  });

  it('preserves a persisted dark theme on read', () => {
    persist({ theme: 'dark', accentColor: '#4F46E5' });

    const config = loadConfig();

    expect(config.theme).toBe('dark');
    expect(config.accentColor).toBe('#4f46e5');
  });

  it('preserves a persisted system theme when the OS prefers dark', () => {
    stubSystemPrefersDark();
    persist({ theme: 'system' });

    expect(loadConfig().theme).toBe('system');
  });

  it('preserves a persisted light theme and rejects malformed values', () => {
    persist({ theme: 'light' });
    expect(loadConfig().theme).toBe('light');
    expect(resolveAppTheme('not-a-theme' as unknown as AppConfig['theme'])).toBe('system');
  });
});

describe('appearance theme — document', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  it('stamps data-theme=light on the root element', () => {
    applyAppearanceToDocument({ theme: 'light', accentColor: '#059669' });

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('stamps data-theme=dark on the root element', () => {
    applyAppearanceToDocument({ theme: 'dark', accentColor: '#059669' });

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('removes data-theme for the system choice so the OS can select the palette', () => {
    stubSystemPrefersDark();
    document.documentElement.setAttribute('data-theme', 'light');

    applyAppearanceToDocument({ theme: 'system', accentColor: '#10B981' });

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});

describe('saved theme and Material accent — pre-hydration script', () => {
  const layoutPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../app/layout.tsx',
  );

  function runThemeInitScript(): void {
    const source = readFileSync(layoutPath, 'utf8');
    const match = /const themeInitScript = `([^`]*)`;/.exec(source);
    if (!match?.[1]) throw new Error('themeInitScript not found in app/layout.tsx');
    // eslint-disable-next-line no-new-func
    new Function(match[1])();
  }

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.removeProperty('--accent');
    store.clear();
  });

  it('paints a saved dark theme before hydration', () => {
    persist({ theme: 'dark' });

    runThemeInitScript();

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('leaves system theme selection to the operating system before hydration', () => {
    stubSystemPrefersDark();
    document.documentElement.setAttribute('data-theme', 'light');
    persist({ theme: 'system' });

    runThemeInitScript();

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('migrates retired literal accents back to the Material primary role', () => {
    persist({ accentColor: '#87ea5c', configMigrationVersion: 2 });

    runThemeInitScript();

    expect(document.documentElement.style.getPropertyValue('--accent'))
      .toBe('var(--md-sys-color-primary)');
  });
});
