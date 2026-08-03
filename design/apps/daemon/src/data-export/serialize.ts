// Format writers for the data export capability.
//
// Every writer takes the same input — a `DataExportEnvelope` plus the records —
// and returns a complete UTF-8 document with LF line endings. Nothing here
// touches the filesystem, the database or the network, so the whole format
// matrix is unit-testable without a running daemon.
//
// The rule these writers exist to keep: a value is either carried faithfully or
// its degradation was declared up front by `describeDataExportFidelity`. No
// writer truncates, and no writer drops a field the envelope's schema lists.
// Where a format cannot hold a shape (nested values in CSV, a null in TOML),
// the substitution below is exactly the one the fidelity verdict named.

import {
  DATA_EXPORT_FORMAT_DESCRIPTORS,
  type DataExportEnvelope,
  type DataExportFieldDescriptor,
  type DataExportFormat,
} from '@open-design/contracts';

export type DataExportRecord = Record<string, unknown>;

export interface SerializeDataExportInput {
  envelope: DataExportEnvelope;
  records: readonly DataExportRecord[];
}

/** Every document ends with a trailing newline; every line break is LF. */
const NEWLINE = '\n';

function joinLines(lines: readonly string[]): string {
  return lines.join(NEWLINE) + NEWLINE;
}

/**
 * The value a writer should treat as "absent". `undefined` and `null` both mean
 * the record had no value; every other falsy value (0, '', false) is real data
 * and must survive.
 */
function isAbsent(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/** JSON text for a nested value, used wherever a format cannot nest. */
function embeddedJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? null) ?? 'null';
  } catch {
    // A cycle can only get here through corrupt stored JSON; say so rather than
    // emitting a half-written value.
    return JSON.stringify({ error: 'value could not be encoded as JSON' });
  }
}

/** Flatten one value to text for the formats that carry only text. */
function scalarText(value: unknown): string {
  if (isAbsent(value)) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return embeddedJson(value);
}

// ---------------------------------------------------------------------------
// JSON / JSON Lines
// ---------------------------------------------------------------------------

export function toJsonDocument(input: SerializeDataExportInput): string {
  return JSON.stringify({ ...input.envelope, records: input.records }, null, 2) + NEWLINE;
}

/**
 * One record per line, nothing else. JSONL has nowhere to put an envelope, so
 * the schema travels in the response headers and in the archive manifest —
 * that is the `no-embedded-schema` warning the plan already reported.
 */
export function toJsonLinesDocument(input: SerializeDataExportInput): string {
  if (input.records.length === 0) return '';
  return input.records.map((record) => JSON.stringify(record)).join(NEWLINE) + NEWLINE;
}

// ---------------------------------------------------------------------------
// YAML
// ---------------------------------------------------------------------------

/**
 * Always double-quoted. An unquoted YAML scalar is re-typed on read — `no`
 * becomes false, `1.0` becomes a float, `2026-08-03` becomes a date — so
 * quoting every string is what makes the round trip actually round.
 */
function yamlString(value: string): string {
  let out = '"';
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (char === '"') out += '\\"';
    else if (char === '\\') out += '\\\\';
    else if (char === '\n') out += '\\n';
    else if (char === '\r') out += '\\r';
    else if (char === '\t') out += '\\t';
    else if (code < 0x20 || code === 0x7f) out += `\\u${code.toString(16).padStart(4, '0')}`;
    else out += char;
  }
  return out + '"';
}

function yamlNumber(value: number): string {
  if (Number.isNaN(value)) return '.nan';
  if (value === Infinity) return '.inf';
  if (value === -Infinity) return '-.inf';
  return String(value);
}

function yamlScalar(value: unknown): string | null {
  if (isAbsent(value)) return 'null';
  if (typeof value === 'string') return yamlString(value);
  if (typeof value === 'number') return yamlNumber(value);
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return null;
}

function yamlLines(value: unknown, indent: string): string[] {
  const scalar = yamlScalar(value);
  if (scalar !== null) return [`${indent}${scalar}`];

  if (Array.isArray(value)) {
    if (value.length === 0) return [`${indent}[]`];
    const lines: string[] = [];
    for (const item of value) {
      const itemScalar = yamlScalar(item);
      if (itemScalar !== null) {
        lines.push(`${indent}- ${itemScalar}`);
        continue;
      }
      const nested = yamlLines(item, `${indent}  `);
      const first = nested[0] ?? '';
      lines.push(`${indent}- ${first.slice(indent.length + 2)}`);
      lines.push(...nested.slice(1));
    }
    return lines;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return [`${indent}{}`];
  const lines: string[] = [];
  for (const [key, item] of entries) {
    const itemScalar = yamlScalar(item);
    if (itemScalar !== null) {
      lines.push(`${indent}${yamlString(key)}: ${itemScalar}`);
      continue;
    }
    lines.push(`${indent}${yamlString(key)}:`);
    lines.push(...yamlLines(item, `${indent}  `));
  }
  return lines;
}

export function toYamlDocument(input: SerializeDataExportInput): string {
  const lines = yamlLines({ ...input.envelope, records: input.records }, '');
  return joinLines(lines);
}

// ---------------------------------------------------------------------------
// TOML
// ---------------------------------------------------------------------------

/**
 * TOML basic strings use JSON's escape set with exactly one exception: TOML 1.0
 * also forbids a raw U+007F, while `JSON.stringify` escapes only code units
 * below U+0020 and lets DEL through unchanged. A record carrying DEL would then
 * produce a .toml file a strict parser rejects — so it is escaped here, by code
 * point rather than by a character-class literal, the way every other writer in
 * this file handles the same character.
 */
function tomlString(value: string): string {
  let out = '';
  for (const char of JSON.stringify(value)) {
    out += char.charCodeAt(0) === 0x7f ? '\\u007F' : char;
  }
  return out;
}

function tomlKey(key: string): string {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : tomlString(key);
}

function tomlScalar(value: unknown): string | null {
  if (typeof value === 'string') return tomlString(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'nan';
    if (value === Infinity) return 'inf';
    if (value === -Infinity) return '-inf';
    return String(value);
  }
  return null;
}

/**
 * TOML has no null. A null-valued field is omitted from its `[[records]]`
 * table, which is exactly the `null-fields-omitted` blocking warning the caller
 * had to acknowledge before this writer ran. The exported schema is embedded as
 * `schemaJson` so a reader can still tell an omitted field from an undefined
 * one.
 */
export function toTomlDocument(input: SerializeDataExportInput): string {
  const { envelope, records } = input;
  const lines: string[] = [
    `# ${envelope.producer} data export`,
    '# TOML 1.0. Fields whose value was null are omitted from their record table;',
    '# consult schemaJson below for the full field list.',
    `schemaVersion = ${envelope.schemaVersion}`,
    `encoding = ${tomlString(envelope.encoding)}`,
    `lineEnding = ${tomlString(envelope.lineEnding)}`,
    `generatedAt = ${tomlString(envelope.generatedAt)}`,
    `dataset = ${tomlString(envelope.dataset)}`,
    `datasetLabel = ${tomlString(envelope.datasetLabel)}`,
    `format = ${tomlString(envelope.format)}`,
    `recordCount = ${envelope.recordCount}`,
    `complete = ${envelope.complete}`,
    `producer = ${tomlString(envelope.producer)}`,
    `schemaJson = ${tomlString(embeddedJson(envelope.fields))}`,
    `filterJson = ${tomlString(embeddedJson(envelope.filter))}`,
    `ignoredFiltersJson = ${tomlString(embeddedJson(envelope.ignoredFilters))}`,
    `warningsJson = ${tomlString(embeddedJson(envelope.warnings))}`,
    `fidelityJson = ${tomlString(embeddedJson(envelope.fidelity))}`,
  ];

  for (const record of records) {
    lines.push('', '[[records]]');
    for (const field of envelope.fields) {
      const value = record[field.name];
      if (isAbsent(value)) continue;
      const scalar = tomlScalar(value);
      lines.push(
        `${tomlKey(field.name)} = ${scalar ?? tomlString(embeddedJson(value))}`,
      );
    }
  }

  return joinLines(lines);
}

// ---------------------------------------------------------------------------
// XML
// ---------------------------------------------------------------------------

/**
 * XML 1.0 permits only tab, LF, CR and U+0020 and above below U+0080. Anything
 * else cannot be represented at all — not even as a numeric character
 * reference — so it is dropped here. That drop is the `control-characters-
 * stripped` blocking warning the caller acknowledged; it is never silent.
 */
function xmlText(value: string): string {
  let out = '';
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0x09 || code === 0x0a || code === 0x0d) {
      out += char;
      continue;
    }
    if (code < 0x20 || code === 0x7f) continue;
    if (char === '&') out += '&amp;';
    else if (char === '<') out += '&lt;';
    else if (char === '>') out += '&gt;';
    else out += char;
  }
  return out;
}

function xmlAttribute(value: string): string {
  return xmlText(value).replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function xmlFieldElement(field: DataExportFieldDescriptor, value: unknown, indent: string): string {
  const name = xmlAttribute(field.name);
  if (isAbsent(value)) {
    return `${indent}<field name="${name}" type="${field.type}" null="true"/>`;
  }
  if (typeof value === 'object') {
    return `${indent}<field name="${name}" type="${field.type}" encoding="json">${xmlText(embeddedJson(value))}</field>`;
  }
  return `${indent}<field name="${name}" type="${field.type}">${xmlText(String(value))}</field>`;
}

export function toXmlDocument(input: SerializeDataExportInput): string {
  const { envelope, records } = input;
  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>'];
  lines.push(
    '<odExport' +
      ` schemaVersion="${envelope.schemaVersion}"` +
      ` encoding="${xmlAttribute(envelope.encoding)}"` +
      ` lineEnding="${xmlAttribute(envelope.lineEnding)}"` +
      ` generatedAt="${xmlAttribute(envelope.generatedAt)}"` +
      ` dataset="${xmlAttribute(envelope.dataset)}"` +
      ` format="${xmlAttribute(envelope.format)}"` +
      ` recordCount="${envelope.recordCount}"` +
      ` complete="${envelope.complete}"` +
      ` producer="${xmlAttribute(envelope.producer)}">`,
  );
  lines.push('  <schema>');
  for (const field of envelope.fields) {
    lines.push(
      `    <field name="${xmlAttribute(field.name)}" type="${field.type}" nullable="${field.nullable}"` +
        (field.redacted ? ' redacted="true"' : '') +
        `>${xmlText(field.description)}</field>`,
    );
  }
  lines.push('  </schema>');
  // The scope that was actually applied, the keys that were not, and what the
  // run could not carry — all three, so `<filter>` can never be read as a claim
  // this dataset honoured a key it ignores.
  lines.push(`  <filter>${xmlText(embeddedJson(envelope.filter))}</filter>`);
  lines.push(`  <ignoredFilters>${xmlText(embeddedJson(envelope.ignoredFilters))}</ignoredFilters>`);
  lines.push(`  <warnings>${xmlText(embeddedJson(envelope.warnings))}</warnings>`);
  lines.push('  <records>');
  for (const record of records) {
    lines.push('    <record>');
    for (const field of envelope.fields) {
      lines.push(xmlFieldElement(field, record[field.name], '      '));
    }
    lines.push('    </record>');
  }
  lines.push('  </records>');
  lines.push('</odExport>');
  return joinLines(lines);
}

// ---------------------------------------------------------------------------
// CSV / TSV
// ---------------------------------------------------------------------------

/** RFC 4180: quote when the value contains a delimiter, quote, CR or LF. */
function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/**
 * TSV has no quoting convention, so a raw tab or newline inside a value would
 * silently create a new column or row. Backslash escapes keep every record on
 * one line; the escape set is stated in the archive manifest and the envelope.
 */
function tsvCell(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\t/g, '\\t')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

export function toDelimitedDocument(
  input: SerializeDataExportInput,
  format: 'csv' | 'tsv',
): string {
  const delimiter = format === 'csv' ? ',' : '\t';
  const cell = format === 'csv' ? csvCell : tsvCell;
  const headers = input.envelope.fields.map((field) => cell(field.name));
  const lines: string[] = [headers.join(delimiter)];
  for (const record of input.records) {
    lines.push(
      input.envelope.fields
        .map((field) => cell(scalarText(record[field.name])))
        .join(delimiter),
    );
  }
  return joinLines(lines);
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

function markdownTableCell(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

/**
 * A fence long enough that nothing inside the block can close it early. Without
 * this, a message containing a triple backtick would truncate its own block —
 * exactly the silent truncation this feature is not allowed to do.
 */
function codeFenceFor(body: string): string {
  let longest = 0;
  for (const run of body.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  return '`'.repeat(Math.max(3, longest + 1));
}

/** Long text and nested values cannot live in a table cell without mangling. */
function needsSections(fields: readonly DataExportFieldDescriptor[]): boolean {
  return fields.some((field) => field.type === 'prose' || field.type === 'json');
}

export function toMarkdownDocument(input: SerializeDataExportInput): string {
  const { envelope, records } = input;
  const lines: string[] = ['---'];
  lines.push(...yamlLines(envelope, ''));
  lines.push('---', '');
  lines.push(`# ${envelope.datasetLabel}`, '');
  lines.push(
    `${envelope.recordCount} record${envelope.recordCount === 1 ? '' : 's'}, ` +
      `schema v${envelope.schemaVersion}, ${envelope.encoding}, LF line endings, ` +
      `generated ${envelope.generatedAt}.`,
    '',
  );

  // A reader of the rendered page never sees the front matter, so anything the
  // run could not carry is stated in the body too.
  if (envelope.warnings.length > 0) {
    lines.push('## What this export could not carry', '');
    for (const warning of envelope.warnings) {
      lines.push(`- **${warning.code}** — ${warning.message}`);
    }
    lines.push('');
  }

  if (records.length === 0) {
    lines.push('_No records matched the filter._', '');
    return joinLines(lines);
  }

  if (!needsSections(envelope.fields)) {
    lines.push(`| ${envelope.fields.map((field) => markdownTableCell(field.name)).join(' | ')} |`);
    lines.push(`| ${envelope.fields.map(() => '---').join(' | ')} |`);
    for (const record of records) {
      lines.push(
        `| ${envelope.fields
          .map((field) => markdownTableCell(scalarText(record[field.name])))
          .join(' | ')} |`,
      );
    }
    lines.push('');
    return joinLines(lines);
  }

  records.forEach((record, index) => {
    lines.push(`## Record ${index + 1}`, '');
    for (const field of envelope.fields) {
      const value = record[field.name];
      if (field.type === 'prose' || field.type === 'json') {
        lines.push(`### ${field.name}`, '');
        if (isAbsent(value)) {
          lines.push('_null_', '');
          continue;
        }
        const body = field.type === 'json' ? embeddedJson(value) : String(value);
        const fence = codeFenceFor(body);
        lines.push(`${fence}${field.type === 'json' ? 'json' : 'text'}`, body, fence, '');
        continue;
      }
      lines.push(`- **${field.name}**: ${isAbsent(value) ? '_null_' : `\`${scalarText(value)}\``}`);
    }
    lines.push('');
  });

  return joinLines(lines);
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

function htmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * A self-contained document: no CDN stylesheet, no remote font, no script.
 * Same prohibition the rest of the product follows, and it keeps the file
 * readable offline years after it was written.
 */
export function toHtmlDocument(input: SerializeDataExportInput): string {
  const { envelope, records } = input;
  const title = `${envelope.datasetLabel} export`;
  const lines: string[] = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta name="od-export-schema-version" content="${htmlText(String(envelope.schemaVersion))}">`,
    `<meta name="od-export-encoding" content="${htmlText(envelope.encoding)}">`,
    `<meta name="od-export-line-ending" content="${htmlText(envelope.lineEnding)}">`,
    `<meta name="od-export-dataset" content="${htmlText(envelope.dataset)}">`,
    `<meta name="od-export-generated-at" content="${htmlText(envelope.generatedAt)}">`,
    `<meta name="od-export-complete" content="${htmlText(String(envelope.complete))}">`,
    `<meta name="generator" content="${htmlText(envelope.producer)}">`,
    `<title>${htmlText(title)}</title>`,
    '<style>',
    ':root{color-scheme:light dark;--od-fg:#1a1c1e;--od-bg:#fdfcff;--od-line:#c3c7cf;--od-muted:#43474e}',
    '@media (prefers-color-scheme:dark){:root{--od-fg:#e2e2e6;--od-bg:#111416;--od-line:#43474e;--od-muted:#c3c7cf}}',
    'body{margin:0;padding:24px;background:var(--od-bg);color:var(--od-fg);',
    'font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans CJK SC","Microsoft YaHei",sans-serif;line-height:1.5}',
    'table{border-collapse:collapse;width:100%;display:block;overflow-x:auto}',
    'th,td{border:1px solid var(--od-line);padding:6px 10px;text-align:left;vertical-align:top}',
    'th{font-weight:600}',
    'pre{white-space:pre-wrap;word-break:break-word;background:rgba(127,127,127,.12);padding:12px;border-radius:8px}',
    '.od-envelope{font-size:.875rem;color:var(--od-muted)}',
    '.od-null{color:var(--od-muted);font-style:italic}',
    '</style>',
    '</head>',
    '<body>',
    `<h1>${htmlText(title)}</h1>`,
    `<p class="od-envelope">${htmlText(
      `${envelope.recordCount} record${envelope.recordCount === 1 ? '' : 's'} · schema v${envelope.schemaVersion} · ` +
        `${envelope.encoding} · LF line endings · generated ${envelope.generatedAt} · fidelity ${envelope.fidelity.level}`,
    )}</p>`,
  ];

  // Stated on the page itself, not only in a meta tag: someone reading this file
  // has no other way to learn the table is a prefix rather than the whole result.
  if (envelope.warnings.length > 0) {
    lines.push('<section><h2>What this export could not carry</h2><ul>');
    for (const warning of envelope.warnings) {
      lines.push(`<li><strong>${htmlText(warning.code)}</strong> — ${htmlText(warning.message)}</li>`);
    }
    lines.push('</ul></section>');
  }

  if (records.length === 0) {
    lines.push('<p class="od-null">No records matched the filter.</p>');
  } else if (!needsSections(envelope.fields)) {
    lines.push('<table><thead><tr>');
    for (const field of envelope.fields) lines.push(`<th>${htmlText(field.name)}</th>`);
    lines.push('</tr></thead><tbody>');
    for (const record of records) {
      lines.push('<tr>');
      for (const field of envelope.fields) {
        const value = record[field.name];
        lines.push(
          isAbsent(value)
            ? '<td class="od-null">null</td>'
            : `<td>${htmlText(scalarText(value))}</td>`,
        );
      }
      lines.push('</tr>');
    }
    lines.push('</tbody></table>');
  } else {
    records.forEach((record, index) => {
      lines.push(`<section><h2>Record ${index + 1}</h2><dl>`);
      for (const field of envelope.fields) {
        const value = record[field.name];
        lines.push(`<dt><strong>${htmlText(field.name)}</strong></dt>`);
        if (isAbsent(value)) {
          lines.push('<dd class="od-null">null</dd>');
          continue;
        }
        if (field.type === 'prose' || field.type === 'json') {
          const body = field.type === 'json' ? embeddedJson(value) : String(value);
          lines.push(`<dd><pre>${htmlText(body)}</pre></dd>`);
          continue;
        }
        lines.push(`<dd>${htmlText(scalarText(value))}</dd>`);
      }
      lines.push('</dl></section>');
    });
  }

  lines.push('</body>', '</html>');
  return joinLines(lines);
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export function serializeDataExport(input: SerializeDataExportInput): string {
  const format: DataExportFormat = input.envelope.format;
  switch (format) {
    case 'json':
      return toJsonDocument(input);
    case 'jsonl':
      return toJsonLinesDocument(input);
    case 'yaml':
      return toYamlDocument(input);
    case 'toml':
      return toTomlDocument(input);
    case 'xml':
      return toXmlDocument(input);
    case 'csv':
      return toDelimitedDocument(input, 'csv');
    case 'tsv':
      return toDelimitedDocument(input, 'tsv');
    case 'markdown':
      return toMarkdownDocument(input);
    case 'html':
      return toHtmlDocument(input);
  }
  const exhaustive: never = format;
  return exhaustive;
}

export function dataExportMediaType(format: DataExportFormat): string {
  return DATA_EXPORT_FORMAT_DESCRIPTORS[format].mediaType;
}
