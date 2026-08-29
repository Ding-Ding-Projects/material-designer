import { describe, expect, it } from 'vitest';

import {
  buildVsCodeHandoffRequest,
  buildFaithfulZipExport,
  createExportSurfaceMount,
  exportAdapterFor,
  exportCapabilitySummary,
  serializeFaithfulExport,
  validateZipExportEntries,
} from '../../src/runtime/export-adapters';

const records = [
  { id: 'one', title: 'A, title', nested: { enabled: true } },
  { id: 'two', title: 'Second', extra: 4, formula: '=SUM(A1:A2)', note: 'line\nbreak' },
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
    expect(csv.body.split('\r\n')[0]).toBe('extra,formula,id,nested,note,title');
    expect(csv.body).toContain('"A, title"');
    expect(csv.body).toContain("'=SUM(A1:A2)");
    expect(csv.warnings).toEqual(expect.arrayContaining([
      'Nested values are JSON-encoded in one cell and may need manual reconstruction.',
      'Line breaks are normalized to spaces in tabular exports.',
      'Formula-like values are prefixed with an apostrophe to prevent spreadsheet execution.',
    ]));

    const schema = serializeFaithfulExport('json-schema', records);
    expect(schema.ok).toBe(true);
    if (!schema.ok) throw new Error(schema.error);
    const properties = (JSON.parse(schema.body) as { items: { properties: Record<string, unknown> } }).items.properties;
    expect(properties.extra).toEqual({ anyOf: [{ type: 'null' }, { type: 'number' }] });
    expect(properties.nested).toEqual({ anyOf: [{ type: 'null' }, { type: 'object' }] });
  });

  it('refuses formats without a bundled faithful adapter', () => {
    const result = serializeFaithfulExport('yaml', records);
    expect(result).toEqual({
      ok: false,
      format: 'yaml',
      error: 'No bundled YAML adapter is available in this build.',
    });
  });

  it('builds the enabled ZIP format through the local adapter', async () => {
    const result = buildFaithfulZipExport(records);
    expect(result.blob.type).toBe('application/zip');
    expect(result.blob.size).toBeGreaterThan(40);
    expect(new Uint8Array(await result.blob.arrayBuffer()).slice(0, 2)).toEqual(new Uint8Array([0x50, 0x4b]));
    expect(result.warnings[0]).toContain('stored entries');
  });

  it('rejects unsafe or duplicate ZIP entries before invoking the encoder', () => {
    expect(validateZipExportEntries([{ path: '../secret.txt', content: 'x' }])).toEqual({
      ok: false,
      error: 'ZIP entry path contains an unsafe segment: ../secret.txt',
    });
    expect(validateZipExportEntries([
      { path: 'same.txt', content: 'one' },
      { path: 'same.txt', content: 'two' },
    ])).toEqual({
      ok: false,
      error: 'ZIP entry path is duplicated: same.txt',
    });
  });
});

describe('VS Code handoff request', () => {
  it('builds a folder request that opens a workspace root', () => {
    expect(buildVsCodeHandoffRequest('C:/projects/sample', 'folder')).toEqual({
      editorId: 'vscode',
      path: 'C:/projects/sample',
      openWorkspaceRoot: true,
      endpoint: '/api/editor/open',
    });
  });

  it('rejects an empty or NUL-containing path without shelling out', () => {
    expect(buildVsCodeHandoffRequest('   ', 'file')).toBeNull();
    expect(buildVsCodeHandoffRequest('bad\0path', 'file')).toBeNull();
  });

  it('exposes one feature-owned mount contract for central C0 wiring', () => {
    const mount = createExportSurfaceMount();
    expect(mount.adapters).toBeTruthy();
    expect(mount.capabilities().enabled.length).toBeGreaterThan(0);
    expect(mount.vsCodeHandoff('C:/projects/sample', 'folder')).toMatchObject({
      openWorkspaceRoot: true,
    });
  });
});
