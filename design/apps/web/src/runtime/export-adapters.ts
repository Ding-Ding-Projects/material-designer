/**
 * The universal export adapter catalogue.
 *
 * This module is deliberately pure. A surface can ask it which formats are
 * faithful and available before opening a save picker, while the existing
 * runtime exporters own the actual browser or daemon write. Keeping the
 * catalogue separate prevents a dropdown from claiming that a format works
 * merely because a filename extension was typed into it.
 */

import { buildZip, type ZipEntry } from './zip';

export type ExportCategory =
  | 'documents-pdf'
  | 'images'
  | 'audio'
  | 'video'
  | 'archives'
  | 'structured-data'
  | 'code-text'
  | 'binary-encodings';

export type FaithfulExportFormat =
  | 'json'
  | 'jsonl'
  | 'yaml'
  | 'toml'
  | 'xml'
  | 'csv'
  | 'tsv'
  | 'markdown'
  | 'html'
  | 'sql'
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'go'
  | 'rust'
  | 'json-schema'
  | 'protobuf'
  | 'zip'
  | '7z';

export interface ArchiveExportOptions {
  readonly compression: 'store' | 'deflate' | 'bzip2' | 'lzma' | 'lzma2' | 'ppmd';
  readonly level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  readonly dictionarySizeMiB: 1 | 2 | 4 | 8 | 16 | 32 | 64 | 128;
  readonly wordSizeKiB: 4 | 8 | 16 | 32 | 64 | 128 | 256;
  readonly solid: boolean;
  readonly threads: number;
  readonly splitVolumeMiB: number | null;
  readonly encryptContent: boolean;
  readonly encryptHeaders: boolean;
}

export interface ExportAdapterDescriptor {
  readonly format: FaithfulExportFormat;
  readonly category: ExportCategory;
  readonly extension: string;
  readonly mediaType: string;
  readonly bundled: boolean;
  readonly available: boolean;
  readonly fidelity: 'lossless' | 'loss-aware' | 'unsupported';
  readonly capabilityNote: string;
  readonly archiveOptions?: readonly (keyof ArchiveExportOptions)[];
}

const ARCHIVE_OPTION_KEYS: readonly (keyof ArchiveExportOptions)[] = [
  'compression',
  'level',
  'dictionarySizeMiB',
  'wordSizeKiB',
  'solid',
  'threads',
  'splitVolumeMiB',
  'encryptContent',
  'encryptHeaders',
];

/**
 * Formats which can be emitted by the web surface without silently dropping a
 * field. Formats without a bundled adapter remain visible in this catalogue
 * but are disabled with the reason that explains the missing capability.
 */
export const UNIVERSAL_EXPORT_ADAPTERS: readonly ExportAdapterDescriptor[] = [
  { format: 'json', category: 'structured-data', extension: 'json', mediaType: 'application/json', bundled: true, available: true, fidelity: 'lossless', capabilityNote: 'Complete UTF-8 structured records.' },
  { format: 'jsonl', category: 'structured-data', extension: 'jsonl', mediaType: 'application/jsonl', bundled: true, available: true, fidelity: 'lossless', capabilityNote: 'One complete record per UTF-8 line.' },
  { format: 'yaml', category: 'structured-data', extension: 'yaml', mediaType: 'application/yaml', bundled: false, available: false, fidelity: 'unsupported', capabilityNote: 'No bundled YAML adapter is available in this build.' },
  { format: 'toml', category: 'structured-data', extension: 'toml', mediaType: 'application/toml', bundled: false, available: false, fidelity: 'unsupported', capabilityNote: 'No bundled TOML adapter is available in this build.' },
  { format: 'xml', category: 'structured-data', extension: 'xml', mediaType: 'application/xml', bundled: true, available: true, fidelity: 'lossless', capabilityNote: 'Complete records with escaped XML values.' },
  { format: 'csv', category: 'structured-data', extension: 'csv', mediaType: 'text/csv;charset=utf-8', bundled: true, available: true, fidelity: 'loss-aware', capabilityNote: 'Tabular projection with a complete header union and explicit nested or formula-value warnings.' },
  { format: 'tsv', category: 'structured-data', extension: 'tsv', mediaType: 'text/tab-separated-values;charset=utf-8', bundled: true, available: true, fidelity: 'loss-aware', capabilityNote: 'Tabular projection with a complete header union and explicit nested or formula-value warnings.' },
  { format: 'markdown', category: 'code-text', extension: 'md', mediaType: 'text/markdown;charset=utf-8', bundled: true, available: true, fidelity: 'lossless', capabilityNote: 'Readable records with explicit field names.' },
  { format: 'html', category: 'code-text', extension: 'html', mediaType: 'text/html;charset=utf-8', bundled: true, available: true, fidelity: 'lossless', capabilityNote: 'Escaped semantic table markup.' },
  { format: 'sql', category: 'structured-data', extension: 'sql', mediaType: 'application/sql', bundled: true, available: true, fidelity: 'lossless', capabilityNote: 'Portable INSERT statements with explicit columns.' },
  { format: 'typescript', category: 'code-text', extension: 'ts', mediaType: 'text/typescript;charset=utf-8', bundled: false, available: false, fidelity: 'unsupported', capabilityNote: 'A typed source projection needs a schema-specific adapter.' },
  { format: 'javascript', category: 'code-text', extension: 'js', mediaType: 'text/javascript;charset=utf-8', bundled: false, available: false, fidelity: 'unsupported', capabilityNote: 'A source projection needs a schema-specific adapter.' },
  { format: 'python', category: 'code-text', extension: 'py', mediaType: 'text/x-python;charset=utf-8', bundled: false, available: false, fidelity: 'unsupported', capabilityNote: 'A source projection needs a schema-specific adapter.' },
  { format: 'go', category: 'code-text', extension: 'go', mediaType: 'text/x-go;charset=utf-8', bundled: false, available: false, fidelity: 'unsupported', capabilityNote: 'A source projection needs a schema-specific adapter.' },
  { format: 'rust', category: 'code-text', extension: 'rs', mediaType: 'text/x-rust;charset=utf-8', bundled: false, available: false, fidelity: 'unsupported', capabilityNote: 'A source projection needs a schema-specific adapter.' },
  { format: 'json-schema', category: 'structured-data', extension: 'schema.json', mediaType: 'application/schema+json', bundled: true, available: true, fidelity: 'loss-aware', capabilityNote: 'Schema describes the exported record shape, while runtime values remain in JSON.' },
  { format: 'protobuf', category: 'binary-encodings', extension: 'proto', mediaType: 'text/plain;charset=utf-8', bundled: false, available: false, fidelity: 'unsupported', capabilityNote: 'A schema-specific protobuf adapter is not bundled.' },
  { format: 'zip', category: 'archives', extension: 'zip', mediaType: 'application/zip', bundled: true, available: true, fidelity: 'lossless', capabilityNote: 'ZIP packaging is available locally in stored mode. Compression, encryption, and split volumes are not available in this adapter.', archiveOptions: ['compression'] },
  { format: '7z', category: 'archives', extension: '7z', mediaType: 'application/x-7z-compressed', bundled: false, available: false, fidelity: 'unsupported', capabilityNote: 'No bundled 7z adapter is available. The picker must keep this option visible and disabled.', archiveOptions: ARCHIVE_OPTION_KEYS },
];

export const EXPORT_CATEGORIES: readonly ExportCategory[] = [
  'documents-pdf',
  'images',
  'audio',
  'video',
  'archives',
  'structured-data',
  'code-text',
  'binary-encodings',
];

export function exportAdapterFor(format: FaithfulExportFormat): ExportAdapterDescriptor {
  return UNIVERSAL_EXPORT_ADAPTERS.find((adapter) => adapter.format === format)
    ?? {
      format,
      category: 'binary-encodings',
      extension: 'bin',
      mediaType: 'application/octet-stream',
      bundled: false,
      available: false,
      fidelity: 'unsupported',
      capabilityNote: 'The requested adapter is not registered in this build.',
    };
}

export interface ExportCapabilitySummary {
  readonly enabled: ExportAdapterDescriptor[];
  readonly unavailable: ExportAdapterDescriptor[];
}

export function exportCapabilitySummary(): ExportCapabilitySummary {
  return {
    enabled: UNIVERSAL_EXPORT_ADAPTERS.filter((adapter) => adapter.available && adapter.bundled),
    unavailable: UNIVERSAL_EXPORT_ADAPTERS.filter((adapter) => !adapter.available || !adapter.bundled),
  };
}

export interface VsCodeHandoffRequest {
  readonly editorId: 'vscode';
  readonly path: string;
  readonly openWorkspaceRoot: boolean;
  readonly endpoint: '/api/editor/open';
}

export type VsCodeHandoffResult =
  | { readonly ok: true; readonly label: string }
  | { readonly ok: false; readonly reason: string; readonly downloadUrl: string | null };

export type ExportFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Build the existing local daemon request without accepting a shell command. */
export function buildVsCodeHandoffRequest(path: string, kind: 'file' | 'folder'): VsCodeHandoffRequest | null {
  const normalized = path.trim();
  if (!normalized || normalized.includes('\0')) return null;
  return {
    editorId: 'vscode',
    path: normalized,
    openWorkspaceRoot: kind === 'folder',
    endpoint: '/api/editor/open',
  };
}

/** Detect Visual Studio Code honestly, then invoke the reviewed local editor route. */
export async function executeVsCodeHandoff(
  path: string,
  kind: 'file' | 'folder',
  request: ExportFetch = fetch,
): Promise<VsCodeHandoffResult> {
  const handoff = buildVsCodeHandoffRequest(path, kind);
  if (!handoff) return { ok: false, reason: 'The export path is empty or invalid.', downloadUrl: null };
  const detected = await request('/api/editor/detect');
  if (!detected.ok) {
    return { ok: false, reason: `Editor detection failed with status ${detected.status}.`, downloadUrl: null };
  }
  const inventory = await detected.json() as {
    editors?: Array<{ id?: string; available?: boolean; label?: string; downloadUrl?: string }>;
    vscodeDownloadUrl?: string;
  };
  const vscode = inventory.editors?.find((editor) => editor.id === 'vscode');
  if (!vscode?.available) {
    return {
      ok: false,
      reason: 'Visual Studio Code is not installed or could not be detected.',
      downloadUrl: vscode?.downloadUrl ?? inventory.vscodeDownloadUrl ?? null,
    };
  }
  const opened = await request(handoff.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      editorId: handoff.editorId,
      path: handoff.path,
      openWorkspaceRoot: handoff.openWorkspaceRoot,
    }),
  });
  if (!opened.ok) {
    let reason = `Visual Studio Code handoff failed with status ${opened.status}.`;
    try {
      const body = await opened.json() as { message?: unknown };
      if (typeof body.message === 'string' && body.message.trim()) reason = body.message;
    } catch {
      // The bounded status message remains the honest fallback.
    }
    return { ok: false, reason, downloadUrl: vscode.downloadUrl ?? inventory.vscodeDownloadUrl ?? null };
  }
  const body = await opened.json() as { label?: unknown };
  return { ok: true, label: typeof body.label === 'string' ? body.label : vscode.label ?? 'Visual Studio Code' };
}

/** Feature-owned C0 mount contract for export consumers. */
export interface ExportSurfaceMount {
  readonly adapters: readonly ExportAdapterDescriptor[];
  readonly capabilities: () => ExportCapabilitySummary;
  readonly serialize: (
    format: FaithfulExportFormat,
    records: readonly ExportRecord[],
  ) => ExportResult;
  readonly zip: (records: readonly ExportRecord[]) => ZipExportResult;
  readonly vsCodeHandoff: (
    path: string,
    kind: 'file' | 'folder',
  ) => VsCodeHandoffRequest | null;
  readonly openInVsCode: typeof executeVsCodeHandoff;
}

/**
 * Supply the export feature to the central C0 host without making the host
 * own adapter policy or serializer details.
 */
export function createExportSurfaceMount(): ExportSurfaceMount {
  return {
    adapters: UNIVERSAL_EXPORT_ADAPTERS,
    capabilities: exportCapabilitySummary,
    serialize: serializeFaithfulExport,
    zip: buildFaithfulZipExport,
    vsCodeHandoff: buildVsCodeHandoffRequest,
    openInVsCode: executeVsCodeHandoff,
  };
}

export type ExportResult = {
  readonly ok: true;
  readonly format: FaithfulExportFormat;
  readonly body: string;
  readonly warnings: readonly string[];
} | {
  readonly ok: false;
  readonly format: FaithfulExportFormat;
  readonly error: string;
};

export type ExportRecord = Readonly<Record<string, unknown>>;

export interface ZipExportResult {
  readonly blob: Blob;
  readonly warnings: readonly string[];
}

export type ZipEntryValidationResult = {
  readonly ok: true;
} | {
  readonly ok: false;
  readonly error: string;
};

const ZIP32_MAX = 0xffff_ffff;
const ZIP_ENTRY_MAX = 0xffff;
const ZIP_PATH_MAX = 0xffff;

/** Validate uncompressed ZIP32 limits before calling the shared encoder. */
export function validateZipExportEntries(
  entries: readonly ZipEntry[],
): ZipEntryValidationResult {
  if (entries.length > ZIP_ENTRY_MAX) {
    return { ok: false, error: `ZIP entry count exceeds ZIP32 limit of ${ZIP_ENTRY_MAX}.` };
  }
  const encoder = new TextEncoder();
  const paths = new Set<string>();
  let localSize = 0;
  let centralSize = 0;
  for (const entry of entries) {
    if (typeof entry.path !== 'string' || entry.path.length === 0 || entry.path.includes('\0')) {
      return { ok: false, error: 'ZIP entry paths must be non-empty strings without NUL characters.' };
    }
    const normalized = entry.path.replace(/\\/gu, '/');
    if (normalized.startsWith('/') || /^[A-Za-z]:/u.test(normalized)) {
      return { ok: false, error: `ZIP entry path must be relative: ${entry.path}` };
    }
    const segments = normalized.split('/');
    if (segments.some((segment) => segment === '.' || segment === '..' || segment.length === 0)) {
      return { ok: false, error: `ZIP entry path contains an unsafe segment: ${entry.path}` };
    }
    const canonicalPath = normalized.normalize('NFC').toLocaleLowerCase('en-US');
    if (paths.has(canonicalPath)) {
      return { ok: false, error: `ZIP entry path collides after canonicalization: ${entry.path}` };
    }
    paths.add(canonicalPath);
    const pathBytes = encoder.encode(normalized).length;
    if (pathBytes > ZIP_PATH_MAX) {
      return { ok: false, error: `ZIP entry path exceeds ZIP32 name limit: ${entry.path}` };
    }
    if (typeof entry.content !== 'string') {
      return { ok: false, error: `ZIP entry content must be text: ${entry.path}` };
    }
    const contentBytes = encoder.encode(entry.content).length;
    if (contentBytes > ZIP32_MAX) {
      return { ok: false, error: `ZIP entry exceeds ZIP32 size limit: ${entry.path}` };
    }
    localSize += 30 + pathBytes + contentBytes;
    centralSize += 46 + pathBytes;
    if (localSize > ZIP32_MAX || centralSize > ZIP32_MAX || localSize + centralSize + 22 > ZIP32_MAX) {
      return { ok: false, error: 'ZIP output exceeds the ZIP32 size limit.' };
    }
  }
  return { ok: true };
}

function stableKeys(records: readonly ExportRecord[]): string[] {
  const keys = new Set<string>();
  for (const record of records) {
    for (const key of Object.keys(record)) keys.add(key);
  }
  return [...keys].sort((a, b) => a.localeCompare(b));
}

function scalar(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value) ?? '';
}

const FORMULA_PREFIX = /^[=+\-@]/u;

function normalizeDelimitedCell(value: string): string {
  // Normalize control whitespace before formula handling. This makes a value
  // beginning with CR, LF, CRLF, tab, or spaces follow one safe path.
  return value.replace(/\r\n|\r|\n|\t/gu, ' ').replace(/^\s+/u, '');
}

function formulaSafe(value: string): { value: string; changed: boolean; normalized: boolean } {
  const normalized = normalizeDelimitedCell(value);
  if (!FORMULA_PREFIX.test(normalized)) {
    return { value: normalized, changed: false, normalized: normalized !== value };
  }
  return { value: `'${normalized}`, changed: true, normalized: normalized !== value };
}

function quoteDelimited(value: string, separator: ',' | '\t'): string {
  const safe = formulaSafe(value).value;
  const text = safe;
  if (text.includes(separator) || text.includes('"')) return `"${text.replace(/"/gu, '""')}"`;
  return text;
}

function renderDelimited(
  records: readonly ExportRecord[],
  separator: ',' | '\t',
): { body: string; warnings: string[] } {
  const keys = stableKeys(records);
  const warnings = new Set<string>();
  if (keys.some((key) => normalizeDelimitedCell(key) !== key)) {
    warnings.add('Tabs and leading spaces are normalized before tabular export.');
  }
  if (keys.some((key) => formulaSafe(key).changed)) {
    warnings.add('Formula-like values are prefixed with an apostrophe to prevent spreadsheet execution.');
  }
  const rows = [keys.map((key) => quoteDelimited(key, separator)).join(separator)];
  for (const record of records) {
    rows.push(keys.map((key) => {
      const raw = scalar(record[key]);
      if (typeof record[key] === 'object' && record[key] !== null) {
        warnings.add('Nested values are JSON-encoded in one cell and may need manual reconstruction.');
      }
      if (/\r\n|\r|\n/u.test(raw)) {
        warnings.add('Line breaks are normalized to spaces in tabular exports.');
      }
      if (/\t|^\s+/u.test(raw)) {
        warnings.add('Tabs and leading spaces are normalized before tabular export.');
      }
      if (formulaSafe(raw).changed) {
        warnings.add('Formula-like values are prefixed with an apostrophe to prevent spreadsheet execution.');
      }
      return quoteDelimited(raw, separator);
    }).join(separator));
  }
  return { body: `${rows.join('\r\n')}\r\n`, warnings: [...warnings] };
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  }[character] ?? character));
}

function renderXml(records: readonly ExportRecord[]): string {
  const rows = records.map((record) => {
    const fields = Object.entries(record).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) =>
      `    <field name="${escapeXml(key)}">${escapeXml(scalar(value))}</field>`).join('\n');
    return `  <record>\n${fields}\n  </record>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<export version="1">\n${rows.join('\n')}\n</export>\n`;
}

function renderMarkdown(records: readonly ExportRecord[]): string {
  return records.map((record, index) => {
    const fields = Object.entries(record).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) =>
      `- **${key}**: ${scalar(value).replace(/\r\n|\r|\n/gu, ' ')}`).join('\n');
    return `## Record ${index + 1}\n${fields}`;
  }).join('\n\n') + (records.length ? '\n' : '');
}

function renderHtml(records: readonly ExportRecord[]): string {
  const keys = stableKeys(records);
  const header = keys.map((key) => `<th scope="col">${escapeXml(key)}</th>`).join('');
  const rows = records.map((record) => `<tr>${keys.map((key) => `<td>${escapeXml(scalar(record[key]))}</td>`).join('')}</tr>`).join('\n');
  return `<!doctype html>\n<meta charset="utf-8">\n<title>Export</title>\n<table>\n<thead><tr>${header}</tr></thead>\n<tbody>${rows}</tbody>\n</table>\n`;
}

function quoteSql(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return `'${scalar(value).replace(/'/gu, "''")}'`;
}

function renderSql(records: readonly ExportRecord[]): string {
  const keys = stableKeys(records);
  if (keys.length === 0) return '-- No records to export.\n';
  const columns = keys.map((key) => `"${key.replace(/"/gu, '""')}"`).join(', ');
  return records.map((record) =>
    `INSERT INTO "export_records" (${columns}) VALUES (${keys.map((key) => quoteSql(record[key])).join(', ')});`,
  ).join('\n') + '\n';
}

function renderJsonSchema(records: readonly ExportRecord[]): string {
  const properties: Record<string, { type: string } | { anyOf: Array<{ type: string }> }> = {};
  for (const key of stableKeys(records)) {
    const types = new Set<string>();
    for (const record of records) {
      const value = Object.prototype.hasOwnProperty.call(record, key) ? record[key] : null;
      const type = value === null || value === undefined
        ? 'null'
        : Array.isArray(value)
          ? 'array'
          : typeof value === 'number'
            ? 'number'
            : typeof value === 'boolean'
              ? 'boolean'
              : typeof value === 'object'
                ? 'object'
                : typeof value === 'string'
                  ? 'string'
                  : 'string';
      types.add(type);
    }
    const orderedTypes = [...types].sort();
    properties[key] = orderedTypes.length === 1
      ? { type: orderedTypes[0] ?? 'null' }
      : { anyOf: orderedTypes.map((type) => ({ type })) };
  }
  return JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'array', items: { type: 'object', properties, additionalProperties: true } }, null, 2) + '\n';
}

/** Serialize only formats for which this module has a complete local adapter. */
export function serializeFaithfulExport(
  format: FaithfulExportFormat,
  records: readonly ExportRecord[],
): ExportResult {
  const adapter = exportAdapterFor(format);
  if (!adapter.available || !adapter.bundled) {
    return { ok: false, format, error: adapter.capabilityNote };
  }
  try {
    switch (format) {
      case 'json':
        return { ok: true, format, body: JSON.stringify({ schema: 'material-designer.export.v1', records }, null, 2) + '\n', warnings: [] };
      case 'jsonl':
        return { ok: true, format, body: records.map((record) => JSON.stringify(record)).join('\n') + (records.length ? '\n' : ''), warnings: [] };
      case 'csv':
        {
          const rendered = renderDelimited(records, ',');
          return { ok: true, format, body: rendered.body, warnings: rendered.warnings };
        }
      case 'tsv':
        {
          const rendered = renderDelimited(records, '\t');
          return { ok: true, format, body: rendered.body, warnings: rendered.warnings };
        }
      case 'xml':
        return { ok: true, format, body: renderXml(records), warnings: [] };
      case 'markdown':
        return { ok: true, format, body: renderMarkdown(records), warnings: [] };
      case 'html':
        return { ok: true, format, body: renderHtml(records), warnings: [] };
      case 'sql':
        return { ok: true, format, body: renderSql(records), warnings: [] };
      case 'json-schema':
        return { ok: true, format, body: renderJsonSchema(records), warnings: ['This file describes the record shape. Runtime values remain in the JSON export.'] };
      default:
        return { ok: false, format, error: adapter.capabilityNote };
    }
  } catch (error) {
    return { ok: false, format, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Build the enabled ZIP format through the same local adapter used by the
 * existing viewer exporters. The catalogue is intentionally explicit about
 * the capability boundary: this adapter stores UTF-8 entries and does not
 * claim compression, encryption, or split-volume support.
 */
export function buildFaithfulZipExport(records: readonly ExportRecord[]): ZipExportResult {
  const json = serializeFaithfulExport('json', records);
  const jsonl = serializeFaithfulExport('jsonl', records);
  if (!json.ok || !jsonl.ok) {
    throw new Error(json.ok ? jsonl.error : json.error);
  }
  const entries: ZipEntry[] = [
    { path: 'export.json', content: json.body },
    { path: 'export.jsonl', content: jsonl.body },
  ];
  const validation = validateZipExportEntries(entries);
  if (!validation.ok) throw new Error(validation.error);
  return {
    blob: buildZip(entries),
    warnings: ['ZIP uses stored entries. Compression, encryption, and split volumes are not available in this build.'],
  };
}
