import { describe, expect, it } from 'vitest';

import {
  buildVsCodeHandoffRequest,
  exportAdapterFor,
  exportCapabilitySummary,
  serializeFaithfulExport,
} from '../../src/runtime/export-adapters';

const records = [
  { id: 'one', title: 'A, title', nested: { enabled: true } },
  { id: 'two', title: 'Second', extra: 4 },
];

describe('universal export adapter catalogue', () => {
  it('keeps every unavailable adapter visible but disabled', () => {
    const summary = exportCapabilitySummary();
    expect(summary.enabled.every((adapter) => adapter.available && adapter.bundled)).toBe(true);
    expect(summary.unavailable.some((adapter) => adapter.format === '7z')).toBe(true);
    expect(exportAdapterFor('7z').available).toBe(false);
  });

  it('preserves the complete key union in structured and tabular exports', () => {
    const json = serializeFaithfulExport('json', records);
    expect(json.ok).toBe(true);
    if (!json.ok) throw new Error(json.error);
    expect(json.body).toContain('"nested"');
    expect(json.body).toContain('"extra"');

    const csv = serializeFaithfulExport('csv', records);
    expect(csv.ok).toBe(true);
    if (!csv.ok) throw new Error(csv.error);
    expect(csv.body.split('\r\n')[0]).toBe('extra,id,nested,title');
    expect(csv.body).toContain('"A, title"');
  });

  it('refuses formats without a bundled faithful adapter', () => {
    const result = serializeFaithfulExport('yaml', records);
    expect(result).toEqual({
      ok: false,
      format: 'yaml',
      error: 'No bundled YAML adapter is available in this build.',
    });
  });
});

describe('VS Code handoff request', () => {
  it('builds a folder request that opens a workspace root', () => {
    expect(buildVsCodeHandoffRequest('C:/projects/sample', 'folder')).toEqual({
      editorId: 'vscode',
      path: 'C:/projects/sample',
      openAsWorkspaceRoot: true,
      endpoint: '/api/editor/open',
    });
  });

  it('rejects an empty or NUL-containing path without shelling out', () => {
    expect(buildVsCodeHandoffRequest('   ', 'file')).toBeNull();
    expect(buildVsCodeHandoffRequest('bad\0path', 'file')).toBeNull();
  });
});
