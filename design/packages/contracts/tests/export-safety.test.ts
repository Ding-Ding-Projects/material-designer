import { describe, expect, it } from 'vitest';
import {
  compareExportPaths,
  exportPathOmissionReason,
  markdownCodeFence,
  markdownInlineCode,
  markdownTableCell,
  redactExportText,
} from '../src/api/export-safety';

describe('export safety contract', () => {
  it('omits credential, cache, traversal, and personal-vocabulary paths', () => {
    expect(exportPathOmissionReason('.env')).toContain('credential');
    expect(exportPathOmissionReason('PERSONAL_VOCABULARY.json')).toContain('personal-vocabulary');
    expect(exportPathOmissionReason('.cache/result.json')).toContain('cache');
    expect(exportPathOmissionReason('../outside.txt')).toContain('traversal');
    expect(exportPathOmissionReason('src/index.ts')).toBeNull();
  });

  it('redacts local absolute paths and records the content field', () => {
    const result = redactExportText('See C:\\Users\\designer\\Documents\\project\\README.md', 'README.md');
    expect(result.value).toContain('[REDACTED:local-path]');
    expect(result.omissions).toEqual([
      { path: 'README.md', field: 'content', reason: 'local absolute path redacted' },
    ]);
  });

  it('orders paths by code point, not the machine locale', () => {
    expect(['z.txt', 'a.txt', 'ä.txt'].sort(compareExportPaths)).toEqual(['a.txt', 'z.txt', 'ä.txt']);
  });

  it('keeps dynamic Markdown tables and code fences intact', () => {
    expect(markdownTableCell('a|b\\nc')).toBe('a\\\\|b<br>c');
    const body = 'value ' + String.fromCharCode(96).repeat(3);
    expect(markdownCodeFence(body)).toBe(String.fromCharCode(96).repeat(4));
    expect(markdownInlineCode('path with newline\\n')).toContain('path with newline ');
  });
});
