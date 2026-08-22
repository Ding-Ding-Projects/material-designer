import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import path from 'node:path';

describe('handoff source contract', () => {
  it('proves the normal and negative registry boundaries', () => {
    const script = path.resolve(process.cwd(), '../../../../scripts/verify-handoff-contract.mjs');
    const output = execFileSync(process.execPath, [script, '--negative'], {
      cwd: path.resolve(process.cwd(), '../../../..'),
      encoding: 'utf8',
    });
    expect(output).toContain('GREEN after restoring every handoff boundary');
    expect(output.match(/RED then restored:/g)).toHaveLength(9);
  });
});
