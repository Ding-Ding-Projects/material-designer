import { describe, expect, it } from 'vitest';

import {
  DATA_EXPORT_DATASETS,
  DATA_EXPORT_DATASET_IDS,
  DATA_EXPORT_FORMATS,
  DATA_EXPORT_FORMAT_DESCRIPTORS,
  DATA_EXPORT_MAX_QUERY_LENGTH,
  DATA_EXPORT_SCHEMA_VERSION,
  applicableDataExportFilter,
  buildDataExportPlan,
  buildSevenZipSwitches,
  dataExportFileName,
  dataExportFormatsFor,
  describeDataExportFidelity,
  describeSevenZipCost,
  normalizeDataExportFilter,
  parseSevenZipSize,
  preferredDataExportFormats,
  redactSevenZipSwitches,
  resolveDataExportDatasets,
  sanitizeDataExportArchiveEntryPath,
  unsupportedDataExportFilterKeys,
  validateSevenZipOptions,
  type DataExportDatasetId,
  type DataExportFormat,
} from '../src/api/data-export';

describe('data export format matrix', () => {
  it('describes every format it advertises', () => {
    for (const format of DATA_EXPORT_FORMATS) {
      const descriptor = DATA_EXPORT_FORMAT_DESCRIPTORS[format];
      expect(descriptor.id).toBe(format);
      expect(descriptor.extension.length).toBeGreaterThan(0);
      expect(descriptor.mediaType).toContain('/');
      expect(descriptor.note.length).toBeGreaterThan(0);
    }
  });

  it('describes every dataset it advertises, with at least one usable format', () => {
    for (const dataset of DATA_EXPORT_DATASET_IDS) {
      const descriptor = DATA_EXPORT_DATASETS[dataset];
      expect(descriptor.id).toBe(dataset);
      expect(descriptor.fields.length).toBeGreaterThan(0);
      // "If a surface can show it, the user can take it away" only holds if at
      // least one format can carry the dataset without a declared data loss.
      expect(dataExportFormatsFor(dataset).length).toBeGreaterThan(0);
    }
  });

  it('never rates JSON as lossy for any dataset', () => {
    for (const dataset of DATA_EXPORT_DATASET_IDS) {
      expect(describeDataExportFidelity(dataset, 'json').level).not.toBe('lossy');
    }
  });

  it('produces a verdict for every dataset/format pair', () => {
    for (const dataset of DATA_EXPORT_DATASET_IDS) {
      for (const format of DATA_EXPORT_FORMATS) {
        const fidelity = describeDataExportFidelity(dataset, format);
        expect(fidelity.dataset).toBe(dataset);
        expect(fidelity.format).toBe(format);
        expect(['faithful', 'degraded', 'lossy']).toContain(fidelity.level);
        // A verdict is only useful if it says which fields it is about.
        for (const warning of fidelity.warnings) {
          expect(warning.message.length).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('lossy-format warnings', () => {
  it('blocks TOML for a dataset with nullable fields, and names them', () => {
    const fidelity = describeDataExportFidelity('projects', 'toml');
    const warning = fidelity.warnings.find((entry) => entry.code === 'null-fields-omitted');
    expect(warning).toBeDefined();
    expect(warning?.severity).toBe('blocking');
    expect(fidelity.level).toBe('lossy');
    // `metadata` is nullable on projects, so it must appear in the at-risk list.
    expect(warning?.fields).toContain('metadata');
  });

  it('does not block TOML for a dataset with no nullable field', () => {
    // `tabs` is all-non-null, so TOML's missing null literal costs it nothing.
    const nullable = DATA_EXPORT_DATASETS.tabs.fields.filter((field) => field.nullable);
    expect(nullable).toHaveLength(0);
    expect(describeDataExportFidelity('tabs', 'toml').level).not.toBe('lossy');
  });

  it('blocks XML for a prose dataset because C0 controls cannot be encoded', () => {
    const fidelity = describeDataExportFidelity('messages', 'xml');
    const warning = fidelity.warnings.find((entry) => entry.code === 'control-characters-stripped');
    expect(warning?.severity).toBe('blocking');
    expect(warning?.fields).toContain('content');
    // The writer strips controls from every value it writes as text, so a caller
    // reading `fields` must not come away believing only the prose is at risk.
    expect(warning?.fields).toContain('role');
    expect(warning?.fields).toContain('id');
  });

  it('blocks XML for a dataset with no prose field at all', () => {
    // `conversations` declares no `prose` field, but its `title` and `sessionMode`
    // go through the same stripping pass as a transcript does. Rating this
    // `faithful` would offer a format for a datum it silently damages.
    expect(DATA_EXPORT_DATASETS.conversations.fields.some((field) => field.type === 'prose')).toBe(
      false,
    );
    const fidelity = describeDataExportFidelity('conversations', 'xml');
    expect(fidelity.level).toBe('lossy');
    const warning = fidelity.warnings.find((entry) => entry.code === 'control-characters-stripped');
    expect(warning?.severity).toBe('blocking');
    expect(warning?.fields).toContain('title');
    expect(warning?.fields).toContain('sessionMode');
  });

  it('rates XML lossy for every dataset, because every dataset has a text-ish field', () => {
    for (const dataset of DATA_EXPORT_DATASET_IDS) {
      expect(describeDataExportFidelity(dataset, 'xml').level, dataset).toBe('lossy');
    }
  });

  it('flags nested fields for the formats that cannot nest', () => {
    for (const format of ['csv', 'tsv', 'toml', 'markdown', 'html'] as DataExportFormat[]) {
      const fidelity = describeDataExportFidelity('messages', format);
      const warning = fidelity.warnings.find((entry) => entry.code === 'nested-fields-flattened');
      expect(warning, `${format} should flag nested fields`).toBeDefined();
      expect(warning?.fields).toContain('events');
    }
  });

  it('never rates a presentation format as faithful', () => {
    for (const dataset of DATA_EXPORT_DATASET_IDS) {
      for (const format of ['markdown', 'html'] as DataExportFormat[]) {
        const fidelity = describeDataExportFidelity(dataset, format);
        expect(fidelity.level).not.toBe('faithful');
        expect(fidelity.warnings.some((entry) => entry.code === 'no-round-trip')).toBe(true);
      }
    }
  });

  it('warns that credential values are placeholders wherever they exist', () => {
    for (const format of DATA_EXPORT_FORMATS) {
      const fidelity = describeDataExportFidelity('settings', format);
      expect(fidelity.warnings.some((entry) => entry.code === 'redacted-fields')).toBe(true);
    }
  });

  it('tells a JSONL/CSV/TSV caller the schema is not inside the file', () => {
    for (const format of ['jsonl', 'csv', 'tsv'] as DataExportFormat[]) {
      const fidelity = describeDataExportFidelity('conversations', format);
      expect(fidelity.warnings.some((entry) => entry.code === 'no-embedded-schema')).toBe(true);
    }
  });
});

describe('archive entry path safety', () => {
  const rejected = [
    '../escape.json',
    'a/../../b.json',
    '/etc/passwd',
    '\\\\server\\share\\x.json',
    'C:\\Windows\\system32\\x.json',
    'c:/windows/x.json',
    '//host/share/x.json',
    'nul',
    'CON.json',
    'lpt1.txt',
    'has:colon.json',
    'has*star.json',
    'trailing.',
    'dir /x.json',
    '',
    '   ',
    '.',
    './..',
  ];

  for (const value of rejected) {
    it(`rejects ${JSON.stringify(value)}`, () => {
      expect(sanitizeDataExportArchiveEntryPath(value)).toBeNull();
    });
  }

  it('rejects a path carrying a control character', () => {
    expect(sanitizeDataExportArchiveEntryPath(`a${String.fromCharCode(0)}b.json`)).toBeNull();
    expect(sanitizeDataExportArchiveEntryPath(`a${String.fromCharCode(31)}b.json`)).toBeNull();
  });

  it('rejects rather than repairs, so a caller cannot believe it archived a path it did not', () => {
    // Stripping the `..` would produce `b.json`, an entry the caller never asked
    // for. Refusing is the only answer that cannot mislead.
    expect(sanitizeDataExportArchiveEntryPath('../b.json')).not.toBe('b.json');
  });

  it('normalizes separators and keeps the path relative', () => {
    expect(sanitizeDataExportArchiveEntryPath('exports\\messages.jsonl')).toBe('exports/messages.jsonl');
    expect(sanitizeDataExportArchiveEntryPath('./exports//messages.jsonl')).toBe('exports/messages.jsonl');
    expect(sanitizeDataExportArchiveEntryPath('od-export-messages-v1-20260803T041833Z.jsonl')).toBe(
      'od-export-messages-v1-20260803T041833Z.jsonl',
    );
  });

  it('rejects an over-long path rather than truncating it into a different name', () => {
    expect(sanitizeDataExportArchiveEntryPath(`${'a'.repeat(200)}.json`)).toBeNull();
    expect(sanitizeDataExportArchiveEntryPath(`${'a/'.repeat(200)}b.json`)).toBeNull();
  });

  it('accepts every filename the exporter itself generates', () => {
    const generatedAt = '2026-08-03T04:18:33.000Z';
    for (const dataset of DATA_EXPORT_DATASET_IDS) {
      for (const format of DATA_EXPORT_FORMATS) {
        const name = dataExportFileName(dataset, format, generatedAt);
        expect(sanitizeDataExportArchiveEntryPath(name), name).toBe(name);
      }
    }
    expect(sanitizeDataExportArchiveEntryPath('manifest.json')).toBe('manifest.json');
    expect(sanitizeDataExportArchiveEntryPath('README.md')).toBe('README.md');
  });
});

describe('7z options', () => {
  it('parses the size grammar 7-Zip actually accepts', () => {
    expect(parseSevenZipSize('64m')).toBe(64 * 1024 * 1024);
    expect(parseSevenZipSize('1g')).toBe(1024 * 1024 * 1024);
    expect(parseSevenZipSize('256K')).toBe(256 * 1024);
    expect(parseSevenZipSize('0m')).toBeNull();
    expect(parseSevenZipSize('64mb')).toBeNull();
    expect(parseSevenZipSize('huge')).toBeNull();
    expect(parseSevenZipSize(64)).toBeNull();
  });

  it('builds the switch list in a stable order', () => {
    const switches = buildSevenZipSwitches({
      method: 'PPMd',
      level: 9,
      dictionarySize: '64m',
      wordSize: 128,
      solid: false,
      threads: 4,
      volumeSize: '100m',
    });
    expect(switches).toEqual([
      '-t7z',
      '-m0=PPMd',
      '-mx=9',
      '-md=64m',
      '-mfb=128',
      '-ms=off',
      '-mmt=4',
      '-v100m',
    ]);
  });

  it('turns header encryption on whenever a password is set', () => {
    const validated = validateSevenZipOptions({ password: 'hunter2' });
    expect(validated.ok).toBe(true);
    expect(validated.resolved.encryptHeaders).toBe(true);
    const switches = buildSevenZipSwitches(validated.resolved);
    expect(switches).toContain('-mhe=on');
    expect(switches).toContain('-phunter2');
  });

  it('blocks a password with visible filenames instead of quietly allowing it', () => {
    const validated = validateSevenZipOptions({ password: 'hunter2', encryptHeaders: false });
    const warning = validated.warnings.find((entry) => entry.code === 'archive-filenames-visible');
    expect(warning?.severity).toBe('blocking');
    expect(buildSevenZipSwitches(validated.resolved)).not.toContain('-mhe=on');
  });

  it('warns that the password reaches the process table', () => {
    const validated = validateSevenZipOptions({ password: 'hunter2' });
    expect(
      validated.warnings.some((entry) => entry.code === 'archive-password-in-process-args'),
    ).toBe(true);
  });

  it('rejects header encryption without a password', () => {
    const validated = validateSevenZipOptions({ encryptHeaders: true });
    expect(validated.ok).toBe(false);
    expect(validated.issues[0]?.path).toBe('sevenZip.encryptHeaders');
  });

  it('rejects malformed sizes, levels, methods, word sizes and thread counts', () => {
    expect(validateSevenZipOptions({ dictionarySize: '64mb' }).ok).toBe(false);
    expect(validateSevenZipOptions({ level: 4 as never }).ok).toBe(false);
    expect(validateSevenZipOptions({ method: 'GZIP' as never }).ok).toBe(false);
    expect(validateSevenZipOptions({ wordSize: 4 }).ok).toBe(false);
    expect(validateSevenZipOptions({ wordSize: 300 }).ok).toBe(false);
    expect(validateSevenZipOptions({ threads: 0 }).ok).toBe(false);
    expect(validateSevenZipOptions({ threads: 'sometimes' as never }).ok).toBe(false);
    expect(validateSevenZipOptions({ volumeSize: 'lots' }).ok).toBe(false);
  });

  it('redacts the password before a switch list is ever echoed back', () => {
    const switches = buildSevenZipSwitches({ password: 'hunter2' });
    const redacted = redactSevenZipSwitches(switches);
    expect(redacted).toContain('-p***');
    expect(redacted.join(' ')).not.toContain('hunter2');
  });

  it('states what a dictionary size costs in memory before the run', () => {
    const small = describeSevenZipCost({ method: 'LZMA2', dictionarySize: '16m' });
    const large = describeSevenZipCost({ method: 'LZMA2', dictionarySize: '256m' });
    expect(large.compressMemoryMb).toBeGreaterThan(small.compressMemoryMb);
    expect(large.compressMemoryMb).toBeGreaterThan(large.decompressMemoryMb);
    expect(describeSevenZipCost({ method: 'Copy' }).speedCost).toBe(1);
    expect(describeSevenZipCost({ level: 9 }).speedCost).toBe(5);
    expect(describeSevenZipCost({ volumeSize: '100m' }).notes.join(' ')).toContain('every part');
  });
});

describe('filters', () => {
  it('bounds the query length rather than silently truncating it', () => {
    const { filter, issues } = normalizeDataExportFilter({
      query: 'x'.repeat(DATA_EXPORT_MAX_QUERY_LENGTH + 1),
    });
    expect(filter.query).toBeUndefined();
    expect(issues[0]?.path).toBe('query');
  });

  it('keeps plain-text search the default and regex an explicit opt-in', () => {
    expect(normalizeDataExportFilter({ query: 'hero' }).filter.regex).toBeUndefined();
    expect(normalizeDataExportFilter({ query: 'hero', regex: true }).filter.regex).toBe(true);
  });

  it('rejects stateful regex flags that would make matching order-dependent', () => {
    expect(normalizeDataExportFilter({ regexFlags: 'g' }).issues).toHaveLength(1);
    expect(normalizeDataExportFilter({ regexFlags: 'y' }).issues).toHaveLength(1);
    expect(normalizeDataExportFilter({ regexFlags: 'imsu' }).issues).toHaveLength(0);
  });

  it('reports an inverted date range instead of returning an empty export silently', () => {
    const { issues } = normalizeDataExportFilter({ since: 2000, until: 1000 });
    expect(issues.some((issue) => issue.path === 'since')).toBe(true);
  });

  it('names the filters a dataset will ignore', () => {
    const { filter } = normalizeDataExportFilter({ projectId: 'p1' });
    // `agent-sessions` has no project column, so a project filter is reported
    // rather than quietly dropped.
    expect(unsupportedDataExportFilterKeys('agent-sessions', filter)).toContain('projectId');
    expect(unsupportedDataExportFilterKeys('messages', filter)).toHaveLength(0);
  });

  it('keeps only the keys a dataset actually applied, so a file cannot claim a scope it lacked', () => {
    const { filter } = normalizeDataExportFilter({ projectId: 'p1', query: 'hero', limit: 5 });
    // `settings` reads no project column at all: a settings export scoped to a
    // project would otherwise state `projectId: p1` while holding every setting.
    const settings = applicableDataExportFilter('settings', filter);
    expect(settings.projectId).toBeUndefined();
    expect(settings.query).toBe('hero');
    expect(settings.limit).toBe(5);
    // What it dropped is exactly what the ignored-key report names.
    expect(unsupportedDataExportFilterKeys('settings', filter)).toEqual(['projectId']);

    const messages = applicableDataExportFilter('messages', filter);
    expect(messages.projectId).toBe('p1');
  });

  it('carries the regex switches only alongside the query they qualify', () => {
    const { filter } = normalizeDataExportFilter({
      query: 'he.o',
      regex: true,
      regexFlags: 'i',
      matchFields: ['content'],
    });
    const applied = applicableDataExportFilter('messages', filter);
    expect(applied.regex).toBe(true);
    expect(applied.regexFlags).toBe('i');
    expect(applied.matchFields).toEqual(['content']);
  });
});

describe('preferred formats', () => {
  it('only ever recommends a format the run endpoint would accept without acknowledgement', () => {
    for (const dataset of DATA_EXPORT_DATASET_IDS) {
      for (const format of preferredDataExportFormats(dataset)) {
        expect(describeDataExportFidelity(dataset, format).level, `${dataset}/${format}`).toBe(
          'faithful',
        );
      }
    }
  });

  it('never recommends TOML for settings, whose nullable fields make it blocking-lossy', () => {
    // The old hand-kept list did exactly this, steering a picker into a 409.
    expect(describeDataExportFidelity('settings', 'toml').level).toBe('lossy');
    expect(preferredDataExportFormats('settings')).not.toContain('toml');
  });

  it('never recommends a presentation format, which can never be faithful', () => {
    for (const dataset of DATA_EXPORT_DATASET_IDS) {
      expect(preferredDataExportFormats(dataset)).not.toContain('markdown');
      expect(preferredDataExportFormats(dataset)).not.toContain('html');
    }
  });

  it('is empty only where no format can be faithful, and still leaves a runnable one', () => {
    for (const dataset of DATA_EXPORT_DATASET_IDS) {
      const preferred = preferredDataExportFormats(dataset);
      if (preferred.length === 0) {
        // `settings` always substitutes a placeholder for a credential, so every
        // format is degraded. An honest empty list beats a padded one — but a
        // caller still has somewhere to fall back to.
        expect(dataset).toBe('settings');
      }
      expect(dataExportFormatsFor(dataset).length, dataset).toBeGreaterThan(0);
    }
  });
});

describe('plan', () => {
  const generatedAt = '2026-08-03T04:18:33.000Z';

  it('names one output file per dataset, carrying the schema version', () => {
    const plan = buildDataExportPlan(
      { datasets: ['projects', 'messages'], format: 'json' },
      { generatedAt },
    );
    expect(plan.schemaVersion).toBe(DATA_EXPORT_SCHEMA_VERSION);
    expect(plan.encoding).toBe('utf-8');
    expect(plan.lineEnding).toBe('lf');
    expect(plan.entries.map((entry) => entry.dataset)).toEqual(['projects', 'messages']);
    for (const entry of plan.entries) {
      expect(entry.fileName).toContain(`v${DATA_EXPORT_SCHEMA_VERSION}`);
      expect(entry.fileName.endsWith('.json')).toBe(true);
    }
  });

  it('honours a per-datum format override', () => {
    const plan = buildDataExportPlan(
      {
        datasets: ['messages', 'files'],
        format: 'json',
        formats: { messages: 'markdown', files: 'csv' },
      },
      { generatedAt },
    );
    expect(plan.entries.find((entry) => entry.dataset === 'messages')?.format).toBe('markdown');
    expect(plan.entries.find((entry) => entry.dataset === 'files')?.format).toBe('csv');
  });

  it('requires acknowledgement when any entry would lose a value', () => {
    const clean = buildDataExportPlan({ datasets: ['projects'], format: 'json' }, { generatedAt });
    expect(clean.requiresAcknowledgement).toBe(false);

    const lossy = buildDataExportPlan({ datasets: ['projects'], format: 'toml' }, { generatedAt });
    expect(lossy.requiresAcknowledgement).toBe(true);
    expect(lossy.warnings.some((warning) => warning.code === 'null-fields-omitted')).toBe(true);
  });

  it('refuses to pretend a ZIP can carry a password', () => {
    const plan = buildDataExportPlan(
      {
        datasets: ['projects'],
        format: 'json',
        archive: { kind: 'zip', sevenZip: { password: 'hunter2' } },
      },
      { generatedAt },
    );
    const warning = plan.warnings.find((entry) => entry.code === 'archive-encryption-unsupported');
    expect(warning?.severity).toBe('blocking');
    expect(plan.requiresAcknowledgement).toBe(true);
  });

  it('shows the exact 7z switches and cost, with the password redacted', () => {
    const plan = buildDataExportPlan(
      {
        datasets: ['projects'],
        format: 'json',
        archive: { kind: '7z', sevenZip: { password: 'hunter2', level: 9, dictionarySize: '64m' } },
      },
      { generatedAt },
    );
    expect(plan.archive?.kind).toBe('7z');
    expect(plan.archive?.sevenZipSwitches).toContain('-mhe=on');
    expect(plan.archive?.sevenZipSwitches).toContain('-p***');
    expect(plan.archive?.sevenZipSwitches?.join(' ')).not.toContain('hunter2');
    expect(plan.archive?.cost?.compressMemoryMb).toBeGreaterThan(0);
  });

  it('expands "all" to every dataset the daemon owns', () => {
    const resolved = resolveDataExportDatasets({ datasets: 'all' });
    expect(resolved).toEqual([...DATA_EXPORT_DATASET_IDS]);
  });

  it('drops duplicate and unknown dataset ids from a list', () => {
    const resolved = resolveDataExportDatasets({
      datasets: ['projects', 'projects', 'nope' as DataExportDatasetId],
    });
    expect(resolved).toEqual(['projects']);
  });
});
