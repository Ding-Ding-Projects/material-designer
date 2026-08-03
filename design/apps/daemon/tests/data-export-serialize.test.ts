// The format matrix, exercised end to end.
//
// The contract these tests hold the writers to: a value is either carried
// faithfully, or its degradation was named by `describeDataExportFidelity`
// BEFORE the writer ran. Nothing is truncated, and no field the envelope's
// schema declares goes missing from the output.

import { describe, expect, it } from 'vitest';
import {
  DATA_EXPORT_DATASETS,
  DATA_EXPORT_ENCODING,
  DATA_EXPORT_FORMATS,
  DATA_EXPORT_LINE_ENDING,
  DATA_EXPORT_PRODUCER,
  DATA_EXPORT_SCHEMA_VERSION,
  describeDataExportFidelity,
  type DataExportDatasetId,
  type DataExportEnvelope,
  type DataExportFormat,
} from '@open-design/contracts';
import {
  serializeDataExport,
  toDelimitedDocument,
  toJsonDocument,
  toJsonLinesDocument,
  toMarkdownDocument,
  toTomlDocument,
  toXmlDocument,
  type DataExportRecord,
} from '../src/data-export/serialize.js';

const GENERATED_AT = '2026-08-03T04:18:33.000Z';
const BELL = String.fromCharCode(7);
const DEL = String.fromCharCode(0x7f);

function envelopeFor(
  dataset: DataExportDatasetId,
  format: DataExportFormat,
  records: readonly DataExportRecord[],
): DataExportEnvelope {
  return {
    schemaVersion: DATA_EXPORT_SCHEMA_VERSION,
    encoding: DATA_EXPORT_ENCODING,
    lineEnding: DATA_EXPORT_LINE_ENDING,
    generatedAt: GENERATED_AT,
    dataset,
    datasetLabel: DATA_EXPORT_DATASETS[dataset].label,
    format,
    recordCount: records.length,
    fields: DATA_EXPORT_DATASETS[dataset].fields,
    filter: {},
    ignoredFilters: [],
    complete: true,
    warnings: [],
    fidelity: describeDataExportFidelity(dataset, format),
    producer: DATA_EXPORT_PRODUCER,
  };
}

/** A message with every declared field populated, and every awkward character. */
const FULL_MESSAGE: DataExportRecord = {
  id: 'm1',
  conversationId: 'c1',
  role: 'assistant',
  content: [
    'Line one, with a comma and a "quote".',
    'A tab\there and a fence ``` inside.',
    `A <script> tag, an & ampersand, and a bell${BELL}character.`,
  ].join('\n'),
  agentId: 'claude',
  agentName: 'Claude',
  events: [{ type: 'text_delta', text: 'hi' }],
  attachments: [],
  producedFiles: ['index.html'],
  feedback: { rating: 'positive', reasonCodes: [] },
  resultDeliveryState: 'delivered',
  sessionMode: 'design',
  position: 0,
  startedAt: 1_754_193_513_000,
  endedAt: 1_754_193_514_000,
  createdAt: 1_754_193_513_000,
};

/** The same shape with every nullable field actually null. */
const SPARSE_MESSAGE: DataExportRecord = {
  id: 'm2',
  conversationId: 'c1',
  role: 'user',
  content: '',
  agentId: null,
  agentName: null,
  events: null,
  attachments: null,
  producedFiles: null,
  feedback: null,
  resultDeliveryState: null,
  sessionMode: null,
  position: 1,
  startedAt: null,
  endedAt: null,
  createdAt: 1_754_193_515_000,
};

describe('format matrix', () => {
  const records = [FULL_MESSAGE, SPARSE_MESSAGE];

  for (const format of DATA_EXPORT_FORMATS) {
    it(`${format} writes every declared field of a fully populated record`, () => {
      const envelope = envelopeFor('messages', format, [FULL_MESSAGE]);
      const document = serializeDataExport({ envelope, records: [FULL_MESSAGE] });
      for (const field of DATA_EXPORT_DATASETS.messages.fields) {
        expect(document, `${format} dropped ${field.name}`).toContain(field.name);
      }
    });

    it(`${format} produces a non-empty LF document with no CRLF`, () => {
      const envelope = envelopeFor('messages', format, records);
      const document = serializeDataExport({ envelope, records });
      expect(document.length).toBeGreaterThan(0);
      expect(document).not.toContain('\r\n');
      expect(document.endsWith('\n')).toBe(true);
    });
  }

  it('covers every format id with a writer', () => {
    for (const format of DATA_EXPORT_FORMATS) {
      const envelope = envelopeFor('tabs', format, []);
      expect(() => serializeDataExport({ envelope, records: [] })).not.toThrow();
    }
  });
});

describe('JSON and JSON Lines', () => {
  it('round-trips a record exactly, including nested values and nulls', () => {
    const envelope = envelopeFor('messages', 'json', [FULL_MESSAGE, SPARSE_MESSAGE]);
    const parsed = JSON.parse(toJsonDocument({ envelope, records: [FULL_MESSAGE, SPARSE_MESSAGE] }));
    expect(parsed.schemaVersion).toBe(DATA_EXPORT_SCHEMA_VERSION);
    expect(parsed.encoding).toBe('utf-8');
    expect(parsed.lineEnding).toBe('lf');
    expect(parsed.producer).toBe(DATA_EXPORT_PRODUCER);
    expect(parsed.records).toEqual([FULL_MESSAGE, SPARSE_MESSAGE]);
    // null survives as null, not as an empty string.
    expect(parsed.records[1].agentId).toBeNull();
  });

  it('writes exactly one parseable record per line, and nothing else', () => {
    const envelope = envelopeFor('messages', 'jsonl', [FULL_MESSAGE, SPARSE_MESSAGE]);
    const document = toJsonLinesDocument({ envelope, records: [FULL_MESSAGE, SPARSE_MESSAGE] });
    const lines = document.split('\n').filter((line) => line.length > 0);
    expect(lines).toHaveLength(2);
    expect(lines.map((line) => JSON.parse(line))).toEqual([FULL_MESSAGE, SPARSE_MESSAGE]);
  });

  it('writes an empty document for no records rather than a stray blank line', () => {
    const envelope = envelopeFor('messages', 'jsonl', []);
    expect(toJsonLinesDocument({ envelope, records: [] })).toBe('');
  });
});

describe('CSV and TSV', () => {
  it('uses RFC 4180 quoting so a comma, quote or newline cannot break a row', () => {
    const envelope = envelopeFor('messages', 'csv', [FULL_MESSAGE]);
    const document = toDelimitedDocument({ envelope, records: [FULL_MESSAGE] }, 'csv');
    const header = document.split('\n')[0];
    expect(header).toBe(DATA_EXPORT_DATASETS.messages.fields.map((field) => field.name).join(','));
    // The content cell holds a comma, a newline and a quote, so it is quoted
    // and its own quotes are doubled.
    expect(document).toContain('"Line one, with a comma and a ""quote"".');
  });

  it('escapes tab and newline in TSV so every record stays on one row', () => {
    const envelope = envelopeFor('messages', 'tsv', [FULL_MESSAGE]);
    const document = toDelimitedDocument({ envelope, records: [FULL_MESSAGE] }, 'tsv');
    const lines = document.split('\n').filter((line) => line.length > 0);
    // Header plus exactly one record line — the embedded newline did not split it.
    expect(lines).toHaveLength(2);
    expect(document).toContain('A tab\\there');
    expect(document).toContain('\\n');
  });

  it('writes a nested value as embedded JSON rather than dropping it', () => {
    const envelope = envelopeFor('messages', 'csv', [FULL_MESSAGE]);
    const document = toDelimitedDocument({ envelope, records: [FULL_MESSAGE] }, 'csv');
    expect(document).toContain('text_delta');
    // And the fidelity verdict said so up front.
    expect(
      describeDataExportFidelity('messages', 'csv').warnings.some(
        (warning) => warning.code === 'nested-fields-flattened',
      ),
    ).toBe(true);
  });
});

describe('TOML', () => {
  it('omits a null-valued field, exactly as the blocking warning said it would', () => {
    const envelope = envelopeFor('messages', 'toml', [SPARSE_MESSAGE]);
    const document = toTomlDocument({ envelope, records: [SPARSE_MESSAGE] });
    expect(document).toContain('[[records]]');
    expect(document).toContain('id = "m2"');
    // `agentId` is null on this record, so there is no `agentId = …` line.
    expect(document).not.toContain('agentId =');

    const warning = describeDataExportFidelity('messages', 'toml').warnings.find(
      (entry) => entry.code === 'null-fields-omitted',
    );
    expect(warning?.severity).toBe('blocking');
    expect(warning?.fields).toContain('agentId');
  });

  it('embeds the schema so an omitted field is still recoverable', () => {
    const envelope = envelopeFor('messages', 'toml', [SPARSE_MESSAGE]);
    const document = toTomlDocument({ envelope, records: [SPARSE_MESSAGE] });
    expect(document).toContain('schemaJson = ');
    expect(document).toContain('agentId');
    expect(document).toContain(`schemaVersion = ${DATA_EXPORT_SCHEMA_VERSION}`);
  });

  it('escapes U+007F, which TOML forbids raw and JSON.stringify leaves through', () => {
    const record: DataExportRecord = { ...SPARSE_MESSAGE, content: `before${DEL}after` };
    const envelope = envelopeFor('messages', 'toml', [record]);
    const document = toTomlDocument({ envelope, records: [record] });
    // A raw DEL would make a strict TOML parser reject the whole file, and
    // `controlCharSafe: true` promises TOML costs this dataset nothing.
    expect(document).not.toContain(DEL);
    expect(document).toContain('\\u007F');
    expect(document).toContain('before');
    expect(document).toContain('after');
  });
});

describe('XML', () => {
  it('drops the control characters it declared it could not encode, and nothing else', () => {
    const envelope = envelopeFor('messages', 'xml', [FULL_MESSAGE]);
    const document = toXmlDocument({ envelope, records: [FULL_MESSAGE] });
    expect(document).not.toContain(BELL);
    // Everything around the dropped character survives.
    expect(document).toContain('and a bell');
    expect(document).toContain('character.');
    const warning = describeDataExportFidelity('messages', 'xml').warnings.find(
      (entry) => entry.code === 'control-characters-stripped',
    );
    expect(warning?.severity).toBe('blocking');
  });

  it('marks a null field rather than writing an empty element that reads as empty text', () => {
    const envelope = envelopeFor('messages', 'xml', [SPARSE_MESSAGE]);
    const document = toXmlDocument({ envelope, records: [SPARSE_MESSAGE] });
    expect(document).toContain('<field name="agentId" type="id" null="true"/>');
  });

  it('escapes markup and keeps field names in attributes', () => {
    const envelope = envelopeFor('messages', 'xml', [FULL_MESSAGE]);
    const document = toXmlDocument({ envelope, records: [FULL_MESSAGE] });
    expect(document).toContain('&lt;script&gt;');
    expect(document).not.toContain('<script>');
    expect(document).toContain('<field name="content"');
  });
});

describe('Markdown and HTML', () => {
  it('opens a code fence long enough that the content cannot close it early', () => {
    const envelope = envelopeFor('messages', 'markdown', [FULL_MESSAGE]);
    const document = toMarkdownDocument({ envelope, records: [FULL_MESSAGE] });
    // The message body itself contains ```; the fence must be longer.
    expect(document).toContain('````text');
    expect(document).toContain('A tab\there and a fence ``` inside.');
  });

  it('uses per-record sections rather than a table when a field holds long text', () => {
    const envelope = envelopeFor('messages', 'markdown', [FULL_MESSAGE]);
    const document = toMarkdownDocument({ envelope, records: [FULL_MESSAGE] });
    expect(document).toContain('## Record 1');
    expect(document).toContain('### content');
  });

  it('uses a table when every field is short', () => {
    const record: DataExportRecord = { projectId: 'p1', name: 'index.html', position: 0, isActive: true };
    const envelope = envelopeFor('tabs', 'markdown', [record]);
    const document = toMarkdownDocument({ envelope, records: [record] });
    expect(document).toContain('| projectId | name | position | isActive |');
    expect(document).toContain('| p1 | index.html | 0 | true |');
  });

  it('writes a self-contained HTML document that escapes user markup', () => {
    const envelope = envelopeFor('messages', 'html', [FULL_MESSAGE]);
    const document = serializeDataExport({ envelope, records: [FULL_MESSAGE] });
    expect(document.startsWith('<!doctype html>')).toBe(true);
    expect(document).toContain('&lt;script&gt;');
    expect(document).not.toContain('<script>');
    expect(document).toContain('name="od-export-schema-version"');
    // No CDN stylesheet, font or remote image.
    expect(document).not.toContain('http://');
    expect(document).not.toContain('https://');
  });

  it('reports an empty result honestly instead of writing a blank page', () => {
    const envelope = envelopeFor('messages', 'html', []);
    expect(serializeDataExport({ envelope, records: [] })).toContain('No records matched the filter.');
    const markdown = envelopeFor('messages', 'markdown', []);
    expect(serializeDataExport({ envelope: markdown, records: [] })).toContain(
      '_No records matched the filter._',
    );
  });
});

describe('scope and completeness', () => {
  /** A truncated export whose filter carried a key `messages` never applied. */
  const truncated: DataExportEnvelope = {
    ...envelopeFor('messages', 'json', [FULL_MESSAGE]),
    filter: { conversationId: 'c1' },
    ignoredFilters: ['projectId'],
    complete: false,
    warnings: [
      {
        code: 'record-ceiling-reached',
        severity: 'warning',
        message: 'The underlying scan stopped at the record ceiling, so this export is a prefix.',
      },
    ],
  };

  it('states the truncation inside every format that can carry an envelope', () => {
    for (const format of ['json', 'yaml', 'toml', 'xml', 'markdown', 'html'] as DataExportFormat[]) {
      const document = serializeDataExport({
        envelope: { ...truncated, format },
        records: [FULL_MESSAGE],
      });
      expect(document, `${format} handed over a prefix without saying so`).toContain(
        'record-ceiling-reached',
      );
    }
  });

  it('never embeds a filter key the dataset did not apply as though it had', () => {
    const parsed = JSON.parse(toJsonDocument({ envelope: truncated, records: [FULL_MESSAGE] }));
    // The file states the scope it really had, and names the rest separately.
    expect(parsed.filter.projectId).toBeUndefined();
    expect(parsed.filter.conversationId).toBe('c1');
    expect(parsed.ignoredFilters).toContain('projectId');
    expect(parsed.complete).toBe(false);
  });
});
