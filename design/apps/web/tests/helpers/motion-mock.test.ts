import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { motion } from './motion-mock';

const cacheDeclarationPattern = /^const componentCache\s*=/gm;

function countCacheDeclarations(source: string): number {
  return source.match(cacheDeclarationPattern)?.length ?? 0;
}

describe('motion mock component identity cache', () => {
  it('declares exactly one component cache and detects a duplicated declaration', () => {
    const source = readFileSync(new URL('./motion-mock.tsx', import.meta.url), 'utf8');

    expect(countCacheDeclarations(source)).toBe(1);
    expect(countCacheDeclarations(`${source}\nconst componentCache = new Map();\n`)).toBe(2);
  });

  it('reuses stable identities for intrinsic and custom proxy properties', () => {
    const proxy = motion as typeof motion & Record<string, unknown>;

    expect(proxy.div).toBe(proxy.div);
    expect(proxy.customSurface).toBe(proxy.customSurface);
    expect(proxy.div).not.toBe(proxy.customSurface);
  });
});
