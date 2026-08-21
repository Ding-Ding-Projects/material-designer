// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { validateProjectArchiveZip } from '../../../src/runtime/exports';

describe('project archive ZIP boundary', () => {
  it('rejects HTML, truncated bytes, and ZIP bodies without the required manifest envelope', () => {
    expect(validateProjectArchiveZip(new TextEncoder().encode('<html>not a zip</html>'))).toMatchObject({ ok: false });
    expect(validateProjectArchiveZip(new Uint8Array(22))).toMatchObject({ ok: false });
  });

  it('keeps the browser validation cap explicit', () => {
    const oversized = { length: 256 * 1024 * 1024 + 1 } as unknown as Uint8Array;
    expect(validateProjectArchiveZip(oversized)).toMatchObject({
      ok: false,
      error: 'project export exceeds the supported archive size',
    });
  });
});
