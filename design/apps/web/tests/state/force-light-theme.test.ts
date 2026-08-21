// @vitest-environment jsdom
//
// Product removed the theme setting: the workspace surfaces have no dark
// tokens, so a dark app is a broken app. Removing the picker is not enough —
// every install that ever touched it still has `theme: 'dark'` (or `'system'`,
// which resolves dark on a dark OS) sitting in localStorage, and a stored
// value does not change just because the default did. These specs pin the
// upstream coerce-on-read/runtime behavior and the product override at the
// pre-hydration boundary, where a saved explicit theme must paint as saved.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyAppearanceToDocument } from '../../src/state/appearance';
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

describe('forced light theme — persisted config', () => {
  beforeEach(() => {
    store.clear();
  });

  it('defaults a fresh install to the light theme', () => {
    expect(DEFAULT_CONFIG.theme).toBe('light');
    expect(loadConfig().theme).toBe('light');
  });

  it('coerces an already-persisted dark theme back to light on read', () => {
    persist({ theme: 'dark', accentColor: '#4F46E5' });

    const config = loadConfig();

    expect(config.theme).toBe('light');
    // Unrelated preferences must survive the coercion.
    expect(config.accentColor).toBe('#4f46e5');
  });

  it('coerces a persisted system theme to light even when the OS prefers dark', () => {
    stubSystemPrefersDark();
    persist({ theme: 'system' });

    expect(loadConfig().theme).toBe('light');
  });

  it('rewrites the coerced theme back to storage so the dark value stops existing', () => {
    persist({ theme: 'dark' });

    loadConfig();

    const written = JSON.parse(store.get(STORAGE_KEY) ?? '{}') as Partial<AppConfig>;
    expect(written.theme).toBe('light');
  });
});

describe('forced light theme — document', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  it('stamps data-theme=light on the root element', () => {
    applyAppearanceToDocument({ accentColor: '#059669' });

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('overwrites a dark data-theme left on the root element', () => {
    document.documentElement.setAttribute('data-theme', 'dark');

    applyAppearanceToDocument({ accentColor: '#059669' });

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  // Every JS theme reader in apps/web (shiki, ConnectorLogo, SketchEditor,
  // TerminalViewer, connectorBrandColor…) checks `data-theme` first and only
  // falls back to `prefers-color-scheme` when the attribute is ABSENT, and
  // every `@media (prefers-color-scheme: dark)` CSS block is gated on
  // `html:not([data-theme])` / `html:not([data-theme="light"])`. So the
  // attribute always being present is what closes the OS-dark leak.
  it('never leaves the root element without an explicit theme', () => {
    stubSystemPrefersDark();

    applyAppearanceToDocument({ accentColor: '#10B981' });

    expect(document.documentElement.hasAttribute('data-theme')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).not.toBe('dark');
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
