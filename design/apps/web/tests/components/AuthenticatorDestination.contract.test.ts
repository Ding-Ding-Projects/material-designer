// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { buildPath, parseRoute } from '../../src/router';
import { buildPaletteRows, type PaletteRegistryContext } from '../../src/components/command-palette/commands';

describe('authenticator destination route contract', () => {
  it('round-trips the visible destination route', () => {
    const route = { kind: 'home', view: 'authenticator' } as const;
    expect(parseRoute('/authenticator')).toEqual(route);
    expect(buildPath(route)).toBe('/authenticator');
  });

  it('keeps the destination in the command-palette registry', () => {
    const goTo = vi.fn();
    const context = {
      t: (key: string) => key,
      openSettingsEntry: vi.fn(),
      goTo,
      openInNewTab: vi.fn(),
      setScope: vi.fn(),
      toggleFullWindow: vi.fn(),
      fullWindow: false,
    } as unknown as PaletteRegistryContext;
    const row = buildPaletteRows(context).find((candidate) => candidate.id === 'go.authenticator');
    expect(row).toMatchObject({ kind: 'destination', title: 'Authenticator' });
    expect(row?.keywords).toEqual(expect.arrayContaining(['authenticator', 'totp', 'unlock ladder']));
    row?.run();
    expect(goTo).toHaveBeenCalledWith({ kind: 'home', view: 'authenticator' });
  });
});
