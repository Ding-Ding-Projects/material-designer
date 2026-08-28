/**
 * The universal export adapter catalogue.
 *
 * This module is deliberately pure. A surface can ask it which formats are
 * faithful and available before opening a save picker, while the existing
 * runtime exporters own the actual browser or daemon write. Keeping the
 * catalogue separate prevents a dropdown from claiming that a format works
 * merely because a filename extension was typed into it.
 */

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
  { format: 'csv', category: 'structured-data', extension: 'csv', mediaType: 'text/csv;charset=utf-8', bundled: true, available: true, fidelity: 'lossless', capabilityNote: 'Tabular projection with a complete header union.' },
  { format: 'tsv', category: 'structured-data', extension: 'tsv', mediaType: 'text/tab-separated-values;charset=utf-8', bundled: true, available: true, fidelity: 'lossless', capabilityNote: 'Tabular projection with a complete header union.' },
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
  { format: 'zip', category: 'archives', extension: 'zip', mediaType: 'application/zip', bundled: true, available: true, fidelity: 'lossless', capabilityNote: 'ZIP packaging is available through the existing local archive adapter.', archiveOptions: ARCHIVE_OPTION_KEYS },
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
  readonly openAsWorkspaceRoot: boolean;
  readonly endpoint: '/api/editor/open';
}

/** Build the existing local daemon request without accepting a shell command. */
export function buildVsCodeHandoffRequest(path: string, kind: 'file' | 'folder'): VsCodeHandoffRequest | null {
  const normalized = path.trim();
  if (!normalized || normalized.includes('\0')) return null;
  return {
    editorId: 'vscode',
    path: normalized,
    openAsWorkspaceRoot: kind === 'folder',
    endpoint: '/api/editor/open',
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

function stableKeys(records: readonly ExportRecord[]): string[] {
  const keys = new Set<string>();
  for (const record of records) {
    for (const key of Object.keys(record)) keys.add(key);
  }
  return [...keys].sort((a, b) => a.localeCompare(b));
}

function scalar(value: unknown): string {
  if (value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function quoteDelimited(value: string, separator: ',' | '\t'): string {
  const text = value.replace(/\r\n|\r|\n/gu, ' ');
  if (text.includes(separator) || text.includes('"')) return `"${text.replace(/"/gu, '""')}"`;
  return text;
}

function renderDelimited(records: readonly ExportRecord[], separator: ',' | '\t'): string {
  const keys = stableKeys(records);
  const rows = [keys.map((key) => quoteDelimited(key, separator)).join(separator)];
  for (const record of records) {
    rows.push(keys.map((key) => quoteDelimited(scalar(record[key]), separator)).join(separator));
  }
  return `${rows.join('\r\n')}\r\n`;
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
  const properties: Record<string, { type: string }> = {};
  for (const key of stableKeys(records)) {
    const value = records.find((record) => record[key] !== null && record[key] !== undefined)?.[key];
    const type = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
    properties[key] = { type: type === 'number' ? 'number' : type === 'boolean' ? 'boolean' : type === 'object' ? 'object' : type === 'string' ? 'string' : 'string' };
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
        return { ok: true, format, body: renderDelimited(records, ','), warnings: [] };
      case 'tsv':
        return { ok: true, format, body: renderDelimited(records, '\t'), warnings: [] };
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
