import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const sourcePath = path.resolve(__dirname, '../../src/components/RoutinesSection.tsx');

describe('RoutinesSection translation contract', () => {
  it('derives the local translator from useT instead of narrowing interpolation variables', () => {
    const source = fs.readFileSync(sourcePath, 'utf8');

    expect(source).toMatch(/^type TranslateFn = ReturnType<typeof useT>;$/m);
    expect(source).not.toMatch(
      /^type TranslateFn = \(key: keyof Dict, vars\?: Record<string, string \| number>\) => string;$/m,
    );
  });
});
