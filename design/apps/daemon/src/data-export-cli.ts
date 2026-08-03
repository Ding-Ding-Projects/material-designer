// Pure argument helpers for `od export data …`, extracted so they can be unit
// tested without executing the CLI entrypoint (cli.ts runs argv dispatch on
// import). Mirrors the shape of `export-cli-request.ts`, which does the same
// job for the artifact export.
//
// Everything here builds a `DataExportRequest` — the same DTO the web Export
// panel posts — so the CLI and the UI cannot drift into two request shapes for
// one endpoint.

import { basename } from 'node:path';

import {
  DATA_EXPORT_ARCHIVE_KINDS,
  DATA_EXPORT_DATASET_IDS,
  DATA_EXPORT_FORMATS,
  SEVEN_ZIP_LEVELS,
  SEVEN_ZIP_METHODS,
  isDataExportDatasetId,
  isDataExportFormat,
  type DataExportArchiveKind,
  type DataExportDatasetId,
  type DataExportFilter,
  type DataExportFormat,
  type DataExportRequest,
  type SevenZipArchiveOptions,
  type SevenZipLevel,
  type SevenZipMethod,
} from '@open-design/contracts';

export type CliFlagValue = string | boolean | undefined;
export type CliFlags = Record<string, CliFlagValue>;

function stringFlag(flags: CliFlags, name: string): string | undefined {
  const value = flags[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function boolFlag(flags: CliFlags, name: string): boolean {
  return flags[name] === true;
}

/** `a,b , c` → `['a','b','c']`. Empty entries are dropped, not silently kept. */
export function parseCommaList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function parseDataExportDatasets(flags: CliFlags): DataExportDatasetId[] | 'all' {
  if (boolFlag(flags, 'all')) return 'all';
  const raw = [
    ...parseCommaList(stringFlag(flags, 'datasets')),
    ...parseCommaList(stringFlag(flags, 'dataset')),
  ];
  if (raw.length === 0) {
    throw new Error(
      `--datasets is required (or --all). Known datasets: ${DATA_EXPORT_DATASET_IDS.join(', ')}`,
    );
  }
  const unknown = raw.filter((id) => !isDataExportDatasetId(id));
  if (unknown.length > 0) {
    throw new Error(
      `unknown dataset(s): ${unknown.join(', ')} (known: ${DATA_EXPORT_DATASET_IDS.join(', ')})`,
    );
  }
  return raw.filter(isDataExportDatasetId);
}

/** `--format-for messages=markdown,files=csv` — format chosen per datum. */
export function parseDataExportFormatOverrides(
  raw: string | undefined,
): Partial<Record<DataExportDatasetId, DataExportFormat>> {
  const out: Partial<Record<DataExportDatasetId, DataExportFormat>> = {};
  for (const entry of parseCommaList(raw)) {
    const separator = entry.indexOf('=');
    if (separator <= 0) {
      throw new Error(`--format-for expects dataset=format entries, got: ${entry}`);
    }
    const dataset = entry.slice(0, separator).trim();
    const format = entry.slice(separator + 1).trim();
    if (!isDataExportDatasetId(dataset)) {
      throw new Error(`--format-for: unknown dataset ${dataset}`);
    }
    if (!isDataExportFormat(format)) {
      throw new Error(
        `--format-for: unknown format ${format} (known: ${DATA_EXPORT_FORMATS.join(', ')})`,
      );
    }
    out[dataset] = format;
  }
  return out;
}

/** Accepts an ISO-8601 date or raw epoch milliseconds; reports which it rejected. */
export function parseDataExportTimestamp(raw: string | undefined, flag: string): number | undefined {
  if (raw === undefined) return undefined;
  if (/^\d+$/.test(raw)) return Number(raw);
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`${flag} must be an ISO-8601 date or epoch milliseconds, got: ${raw}`);
  }
  return parsed;
}

function parseIntegerFlag(raw: string | undefined, flag: string): number | undefined {
  if (raw === undefined) return undefined;
  if (!/^\d+$/.test(raw)) throw new Error(`${flag} must be a non-negative integer, got: ${raw}`);
  return Number(raw);
}

export function buildDataExportCliFilter(flags: CliFlags): DataExportFilter {
  const filter: DataExportFilter = {};
  const projectId = stringFlag(flags, 'project');
  const conversationId = stringFlag(flags, 'conversation');
  const since = parseDataExportTimestamp(stringFlag(flags, 'since'), '--since');
  const until = parseDataExportTimestamp(stringFlag(flags, 'until'), '--until');
  const query = stringFlag(flags, 'query');
  const regexFlags = stringFlag(flags, 'regex-flags');
  const matchFields = parseCommaList(stringFlag(flags, 'match-fields'));
  const limit = parseIntegerFlag(stringFlag(flags, 'limit'), '--limit');
  const offset = parseIntegerFlag(stringFlag(flags, 'offset'), '--offset');

  if (projectId !== undefined) filter.projectId = projectId;
  if (conversationId !== undefined) filter.conversationId = conversationId;
  if (since !== undefined) filter.since = since;
  if (until !== undefined) filter.until = until;
  if (query !== undefined) filter.query = query;
  // Plain text stays the default; regex is only ever an explicit opt-in.
  if (boolFlag(flags, 'regex')) filter.regex = true;
  if (regexFlags !== undefined) filter.regexFlags = regexFlags;
  if (matchFields.length > 0) filter.matchFields = matchFields;
  if (limit !== undefined) filter.limit = limit;
  if (offset !== undefined) filter.offset = offset;
  return filter;
}

/**
 * 7z options from flags. The password never arrives as a flag value — it is
 * read from a file or stdin by the caller and passed in here — so it does not
 * end up in the shell history or the process table of the `od` invocation.
 */
export function buildSevenZipCliOptions(
  flags: CliFlags,
  password?: string,
): SevenZipArchiveOptions {
  const options: SevenZipArchiveOptions = {};

  const method = stringFlag(flags, '7z-method');
  if (method !== undefined) {
    const match = SEVEN_ZIP_METHODS.find((candidate) => candidate.toLowerCase() === method.toLowerCase());
    if (!match) {
      throw new Error(`--7z-method must be one of: ${SEVEN_ZIP_METHODS.join(', ')}`);
    }
    options.method = match as SevenZipMethod;
  }

  const level = stringFlag(flags, '7z-level');
  if (level !== undefined) {
    const numeric = Number(level);
    if (!(SEVEN_ZIP_LEVELS as readonly number[]).includes(numeric)) {
      throw new Error(`--7z-level must be one of: ${SEVEN_ZIP_LEVELS.join(', ')}`);
    }
    options.level = numeric as SevenZipLevel;
  }

  const dictionarySize = stringFlag(flags, '7z-dict');
  if (dictionarySize !== undefined) options.dictionarySize = dictionarySize;

  const wordSize = parseIntegerFlag(stringFlag(flags, '7z-word-size'), '--7z-word-size');
  if (wordSize !== undefined) options.wordSize = wordSize;

  if (boolFlag(flags, 'no-7z-solid')) options.solid = false;
  else if (boolFlag(flags, '7z-solid')) options.solid = true;

  const solidBlockSize = stringFlag(flags, '7z-solid-block');
  if (solidBlockSize !== undefined) options.solidBlockSize = solidBlockSize;

  const threads = stringFlag(flags, '7z-threads');
  if (threads !== undefined) {
    if (threads === 'on' || threads === 'off') options.threads = threads;
    else {
      const numeric = parseIntegerFlag(threads, '--7z-threads');
      if (numeric === undefined || numeric < 1) {
        throw new Error('--7z-threads must be a positive integer, "on", or "off"');
      }
      options.threads = numeric;
    }
  }

  const volumeSize = stringFlag(flags, '7z-volume');
  if (volumeSize !== undefined) options.volumeSize = volumeSize;

  if (password !== undefined && password.length > 0) {
    options.password = password;
    // Header encryption is on unless the user explicitly turns it off, and
    // turning it off is a blocking warning the daemon will make them
    // acknowledge — an archive that hides content but publishes filenames is
    // not the protection it looks like.
    options.encryptHeaders = !boolFlag(flags, '7z-no-encrypt-headers');
  } else if (boolFlag(flags, '7z-no-encrypt-headers')) {
    throw new Error('--7z-no-encrypt-headers only means something with a password (--7z-password-file)');
  }

  return options;
}

export function parseDataExportArchiveKind(flags: CliFlags): DataExportArchiveKind | undefined {
  const raw = stringFlag(flags, 'archive');
  if (raw === undefined) return undefined;
  if (!(DATA_EXPORT_ARCHIVE_KINDS as readonly string[]).includes(raw)) {
    throw new Error(`--archive must be one of: ${DATA_EXPORT_ARCHIVE_KINDS.join(', ')}`);
  }
  return raw as DataExportArchiveKind;
}

export interface BuildDataExportCliRequestOptions {
  /** Read from `--7z-password-file`; never from a flag value. */
  password?: string;
}

export function buildDataExportCliRequest(
  flags: CliFlags,
  options: BuildDataExportCliRequestOptions = {},
): DataExportRequest {
  const format = stringFlag(flags, 'format');
  if (format === undefined) {
    throw new Error(`--format is required (one of: ${DATA_EXPORT_FORMATS.join(', ')})`);
  }
  if (!isDataExportFormat(format)) {
    throw new Error(`unknown --format ${format} (known: ${DATA_EXPORT_FORMATS.join(', ')})`);
  }

  const datasets = parseDataExportDatasets(flags);
  const formats = parseDataExportFormatOverrides(stringFlag(flags, 'format-for'));
  const filter = buildDataExportCliFilter(flags);
  const archiveKind = parseDataExportArchiveKind(flags);
  const sevenZip = archiveKind === '7z' ? buildSevenZipCliOptions(flags, options.password) : undefined;

  if (options.password !== undefined && archiveKind !== '7z') {
    throw new Error('a password needs --archive 7z; ZIP archives here are written unencrypted');
  }

  return {
    datasets,
    format,
    ...(Object.keys(formats).length > 0 ? { formats } : {}),
    ...(Object.keys(filter).length > 0 ? { filter } : {}),
    ...(archiveKind
      ? {
          archive: {
            kind: archiveKind,
            ...(sevenZip && Object.keys(sevenZip).length > 0 ? { sevenZip } : {}),
          },
        }
      : {}),
    ...(boolFlag(flags, 'accept-lossy') ? { acknowledgeLossy: true } : {}),
  };
}

/**
 * Reduce a server-suggested filename to a single path segment.
 *
 * `Content-Disposition` is remote-controlled input: `--daemon-url` points the
 * CLI at whatever daemon the operator names, and the result of this function is
 * handed straight to `writeFile` as the write target. Unreduced, a header of
 * `filename="../../../../.ssh/authorized_keys"` — or the percent-encoded
 * `filename*=UTF-8''..%2F..%2F.bashrc`, which `decodeURIComponent` turns back
 * into traversal — would write response bytes anywhere the user can write.
 * Backslashes are folded to `/` first so a Windows-style separator cannot
 * survive `basename` on a POSIX host.
 */
function singleSegmentName(raw: string, fallback: string): string {
  const name = basename(raw.replace(/\\/gu, '/'));
  return name.length === 0 || name === '.' || name === '..' ? fallback : name;
}

/**
 * Where `od export data` writes when the caller gave no `--out`. Prefers the
 * filename the daemon chose (schema version and timestamp already baked in),
 * reduced to a bare filename, and falls back to a name that still carries both.
 * `--out` is untouched by any of this: that path is the caller's own.
 */
export function dataExportCliOutputName(
  contentDisposition: string | null | undefined,
  fallback: string,
): string {
  const raw = contentDisposition ?? '';
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(raw)?.[1];
  if (encoded) {
    try {
      return singleSegmentName(decodeURIComponent(encoded), fallback);
    } catch {
      /* fall through to the plain form */
    }
  }
  const plain = /filename="([^"]+)"/i.exec(raw)?.[1];
  if (plain) return singleSegmentName(plain, fallback);
  return fallback;
}
