import { describe, expect, it } from 'vitest';

import { buildPath, parseRoute } from '../src/router';

describe('handoff route', () => {
  it('parses the dedicated route without accepting a child path', () => {
    expect(parseRoute('/handoff')).toEqual({ kind: 'home', view: 'handoff' });
    expect(parseRoute('/handoff/extra')).toEqual({ kind: 'home', view: 'home' });
  });

  it('builds the same address from the typed entry view', () => {
    expect(buildPath({ kind: 'home', view: 'handoff' })).toBe('/handoff');
  });
});
