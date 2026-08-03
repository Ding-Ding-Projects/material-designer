// `od export data …` argument handling.
//
// The CLI is the embeddability contract: an external agent drives the export
// through these flags and never renders the web UI, so the request this builds
// must be the same `DataExportRequest` DTO the web Export panel posts.

import { describe, expect, it } from 'vitest';
import {
  buildDataExportCliFilter,
  buildDataExportCliRequest,
  buildSevenZipCliOptions,
  dataExportCliOutputName,
  parseCommaList,
  parseDataExportArchiveKind,
  parseDataExportDatasets,
  parseDataExportFormatOverrides,
  parseDataExportTimestamp,
} from '../src/data-export-cli.js';

describe('dataset selection', () => {
  it('parses a comma list and rejects an unknown id by name', () => {
    expect(parseDataExportDatasets({ datasets: 'messages,files' })).toEqual(['messages', 'files']);
    expect(parseDataExportDatasets({ dataset: 'projects' })).toEqual(['projects']);
    expect(() => parseDataExportDatasets({ datasets: 'messages,nope' })).toThrowError(/nope/);
  });

  it('treats --all as every dataset', () => {
    expect(parseDataExportDatasets({ all: true })).toBe('all');
  });

  it('asks for a selection rather than guessing one', () => {
    expect(() => parseDataExportDatasets({})).toThrowError(/--datasets is required/);
  });

  it('drops empty entries from a comma list instead of sending blanks', () => {
    expect(parseCommaList('a, ,b,')).toEqual(['a', 'b']);
    expect(parseCommaList(undefined)).toEqual([]);
  });
});

describe('per-datum format', () => {
  it('parses dataset=format pairs', () => {
    expect(parseDataExportFormatOverrides('messages=markdown,files=csv')).toEqual({
      messages: 'markdown',
      files: 'csv',
    });
  });

  it('rejects a malformed pair, an unknown dataset and an unknown format', () => {
    expect(() => parseDataExportFormatOverrides('messages')).toThrowError(/dataset=format/);
    expect(() => parseDataExportFormatOverrides('=json')).toThrowError(/dataset=format/);
    expect(() => parseDataExportFormatOverrides('nope=json')).toThrowError(/unknown dataset/);
    expect(() => parseDataExportFormatOverrides('messages=parquet')).toThrowError(/unknown format/);
  });
});

describe('filters', () => {
  it('accepts both an ISO date and epoch milliseconds', () => {
    expect(parseDataExportTimestamp('1754193513000', '--since')).toBe(1_754_193_513_000);
    expect(parseDataExportTimestamp('2026-08-03T04:18:33.000Z', '--since')).toBe(
      Date.parse('2026-08-03T04:18:33.000Z'),
    );
    expect(parseDataExportTimestamp(undefined, '--since')).toBeUndefined();
    expect(() => parseDataExportTimestamp('last tuesday', '--since')).toThrowError(/--since/);
  });

  it('keeps plain text the default and regex an explicit opt-in', () => {
    expect(buildDataExportCliFilter({ query: 'hero' }).regex).toBeUndefined();
    expect(buildDataExportCliFilter({ query: 'hero', regex: true }).regex).toBe(true);
  });

  it('composes scope, range, query and window into one filter', () => {
    const filter = buildDataExportCliFilter({
      project: 'p1',
      conversation: 'c1',
      since: '1000',
      until: '2000',
      query: 'hero',
      'regex-flags': 'i',
      'match-fields': 'content,title',
      limit: '50',
      offset: '10',
    });
    expect(filter).toEqual({
      projectId: 'p1',
      conversationId: 'c1',
      since: 1000,
      until: 2000,
      query: 'hero',
      regexFlags: 'i',
      matchFields: ['content', 'title'],
      limit: 50,
      offset: 10,
    });
  });

  it('rejects a non-numeric window', () => {
    expect(() => buildDataExportCliFilter({ limit: 'lots' })).toThrowError(/--limit/);
  });
});

describe('request', () => {
  it('requires a format and rejects an unknown one', () => {
    expect(() => buildDataExportCliRequest({ datasets: 'projects' })).toThrowError(/--format is required/);
    expect(() =>
      buildDataExportCliRequest({ datasets: 'projects', format: 'parquet' }),
    ).toThrowError(/unknown --format/);
  });

  it('builds the same DTO shape the web panel posts', () => {
    expect(
      buildDataExportCliRequest({
        datasets: 'messages',
        format: 'jsonl',
        project: 'p1',
        'accept-lossy': true,
      }),
    ).toEqual({
      datasets: ['messages'],
      format: 'jsonl',
      filter: { projectId: 'p1' },
      acknowledgeLossy: true,
    });
  });

  it('omits an empty filter rather than sending an empty object', () => {
    expect(buildDataExportCliRequest({ all: true, format: 'json' })).toEqual({
      datasets: 'all',
      format: 'json',
    });
  });

  it('validates the archive kind', () => {
    expect(parseDataExportArchiveKind({ archive: 'zip' })).toBe('zip');
    expect(parseDataExportArchiveKind({ archive: '7z' })).toBe('7z');
    expect(parseDataExportArchiveKind({})).toBeUndefined();
    expect(() => parseDataExportArchiveKind({ archive: 'rar' })).toThrowError(/--archive must be/);
  });

  it('refuses a password that a ZIP cannot honour', () => {
    expect(() =>
      buildDataExportCliRequest({ datasets: 'projects', format: 'json', archive: 'zip' }, { password: 'x' }),
    ).toThrowError(/needs --archive 7z/);
  });
});

describe('7z flags', () => {
  it('maps every exposed knob onto the option DTO', () => {
    expect(
      buildSevenZipCliOptions({
        '7z-method': 'ppmd',
        '7z-level': '9',
        '7z-dict': '64m',
        '7z-word-size': '128',
        'no-7z-solid': true,
        '7z-threads': '4',
        '7z-volume': '100m',
      }),
    ).toEqual({
      method: 'PPMd',
      level: 9,
      dictionarySize: '64m',
      wordSize: 128,
      solid: false,
      threads: 4,
      volumeSize: '100m',
    });
  });

  it('accepts on/off for threads and rejects nonsense', () => {
    expect(buildSevenZipCliOptions({ '7z-threads': 'off' }).threads).toBe('off');
    expect(buildSevenZipCliOptions({ '7z-threads': 'on' }).threads).toBe('on');
    expect(() => buildSevenZipCliOptions({ '7z-threads': 'many' })).toThrowError(/--7z-threads/);
  });

  it('rejects an unknown method and an unsupported level', () => {
    expect(() => buildSevenZipCliOptions({ '7z-method': 'gzip' })).toThrowError(/--7z-method/);
    expect(() => buildSevenZipCliOptions({ '7z-level': '4' })).toThrowError(/--7z-level/);
  });

  it('encrypts headers by default whenever a password is supplied', () => {
    expect(buildSevenZipCliOptions({}, 'hunter2')).toEqual({
      password: 'hunter2',
      encryptHeaders: true,
    });
  });

  it('lets the user turn header encryption off, but only with a password', () => {
    expect(buildSevenZipCliOptions({ '7z-no-encrypt-headers': true }, 'hunter2').encryptHeaders).toBe(
      false,
    );
    expect(() => buildSevenZipCliOptions({ '7z-no-encrypt-headers': true })).toThrowError(
      /only means something with a password/,
    );
  });
});

describe('output naming', () => {
  it('prefers the daemon-suggested filename, which already carries the schema version', () => {
    expect(
      dataExportCliOutputName(
        `attachment; filename="od-export-messages-v1-20260803T041833Z.jsonl"`,
        'fallback.jsonl',
      ),
    ).toBe('od-export-messages-v1-20260803T041833Z.jsonl');
  });

  it('decodes an RFC 5987 filename*', () => {
    expect(
      dataExportCliOutputName(
        `attachment; filename="fallback.json"; filename*=UTF-8''od-export-%E6%B8%AC.json`,
        'fallback.json',
      ),
    ).toBe('od-export-測.json');
  });

  it('falls back when the daemon suggested nothing', () => {
    expect(dataExportCliOutputName(null, 'od-export.json')).toBe('od-export.json');
    expect(dataExportCliOutputName('attachment', 'od-export.json')).toBe('od-export.json');
  });

  it('reduces a traversing filename to one path segment', () => {
    // `--daemon-url` points the CLI at an operator-supplied daemon, so this
    // header is remote input and the result is the write target. Unreduced it
    // would write the response body outside the working directory entirely.
    expect(
      dataExportCliOutputName(
        `attachment; filename="../../../../.ssh/authorized_keys"`,
        'od-export.json',
      ),
    ).toBe('authorized_keys');
    expect(
      dataExportCliOutputName(`attachment; filename="..\\..\\evil.json"`, 'od-export.json'),
    ).toBe('evil.json');
  });

  it('reduces a traversing filename* after it is percent-decoded', () => {
    // The encoded form is the one that survives a naive check: the traversal
    // only appears once `decodeURIComponent` has run.
    expect(
      dataExportCliOutputName(
        `attachment; filename*=UTF-8''..%2F..%2F..%2F.bashrc`,
        'od-export.json',
      ),
    ).toBe('.bashrc');
  });

  it('falls back rather than writing to a name that reduces to nothing', () => {
    expect(dataExportCliOutputName(`attachment; filename="../.."`, 'od-export.json')).toBe(
      'od-export.json',
    );
    expect(dataExportCliOutputName(`attachment; filename*=UTF-8''%2E%2E`, 'od-export.json')).toBe(
      'od-export.json',
    );
  });
});
