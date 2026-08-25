import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../../src/components/FileWorkspace.tsx', import.meta.url),
  'utf8',
);

describe('FileWorkspace translation contract', () => {
  it('derives its helper translator from useT instead of narrowing interpolation variables', () => {
    expect(source).toMatch(
      /^type TranslateFn = ReturnType<typeof useT>;$/m,
    );
    expect(source).not.toMatch(
      /^type TranslateFn = \(key: keyof Dict, vars\?: Record<string, string \| number>\) => string;$/m,
    );
  });
});
