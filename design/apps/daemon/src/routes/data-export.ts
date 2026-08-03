// `/api/export/*` — the daemon's data export capability.
//
// Five endpoints, one shared plan:
//
//   GET  /api/export/formats            the format matrix and what each costs
//   GET  /api/export/datasets           every dataset the daemon owns, with a
//                                       per-format fidelity verdict
//   POST /api/export/plan               what an export would produce, including
//                                       every field at risk — nothing written
//   POST /api/export                    run it
//   GET  /api/export/staged/:token/:name a split 7z volume
//
// `/api/export/plan` and `/api/export` build the plan through the same helper,
// so the run can never disagree with the preview the user approved. A plan
// carrying a `blocking` warning refuses to run until the caller sets
// `acknowledgeLossy`, which is what "say what will be lost BEFORE the export
// runs" means in practice.
//
// The web Export panel and `od export data …` are both clients of these
// endpoints; neither surface owns any of the logic below.

import type { Express, Response } from 'express';
import {
  DATA_EXPORT_DATASETS,
  DATA_EXPORT_DATASET_IDS,
  DATA_EXPORT_ENCODING,
  DATA_EXPORT_FORMATS,
  DATA_EXPORT_FORMAT_DESCRIPTORS,
  DATA_EXPORT_LINE_ENDING,
  DATA_EXPORT_PRODUCER,
  DATA_EXPORT_SCHEMA_VERSION,
  applicableDataExportFilter,
  buildDataExportPlan,
  dataExportFileName,
  describeDataExportFidelity,
  isDataExportDatasetId,
  isDataExportFormat,
  normalizeDataExportFilter,
  preferredDataExportFormats,
  resolveDataExportDatasets,
  validateSevenZipOptions,
  type DataExportDatasetId,
  type DataExportEnvelope,
  type DataExportFilter,
  type DataExportFormat,
  type DataExportPlan,
  type DataExportRequest,
  type JsonValue,
} from '@open-design/contracts';
import type { RouteDeps } from '../server-context.js';
import {
  DataExportArchiveError,
  DataExportStagingStore,
  buildDataExportSevenZip,
  buildDataExportZip,
  disposeSevenZipArtifacts,
  readSevenZipArtifact,
  resolveSevenZipBinary,
  type DataExportArchiveEntry,
} from '../data-export/archive.js';
import {
  DataExportFilterError,
  collectDataExportDataset,
  type DataExportCollectorDeps,
} from '../data-export/datasets.js';
import { serializeDataExport, type DataExportRecord } from '../data-export/serialize.js';

export interface RegisterDataExportRoutesDeps
  extends RouteDeps<'db' | 'http' | 'ids' | 'paths' | 'projectStore' | 'projectFiles' | 'appConfig'> {}

interface CollectedEntry {
  dataset: DataExportDatasetId;
  records: DataExportRecord[];
  /**
   * False when these records are a prefix rather than the whole result — the
   * scan hit the ceiling, or a source could not be read. `warnings` says which.
   */
  complete: boolean;
  /**
   * Warnings about the run rather than the format, scoped to this dataset. They
   * travel into the file's own envelope as well as into the plan, so a
   * single-file export cannot arrive truncated with nothing on it saying so.
   */
  warnings: DataExportPlan['warnings'];
}

/**
 * How many characters of warning JSON one response header may carry. Well under
 * the 16 KiB total-header budget an HTTP client will parse, and comfortably
 * above what a single dataset's warnings occupy.
 */
const WARNING_HEADER_BUDGET = 6000;

/**
 * JSON for a response header, escaped to pure ASCII.
 *
 * `setHeader` rejects any code point outside latin-1, and several of these
 * warning messages carry an em dash — so emitting the raw JSON would throw and
 * take the whole export down with it. Escaping by code unit keeps the value
 * valid JSON (a surrogate pair simply becomes two escapes), so a client parses
 * it with `JSON.parse` and nothing else. Checked by code point rather than by a
 * character-class literal, for the same reason the archive path guard is.
 */
function asciiJsonHeader(value: unknown): string {
  const json = JSON.stringify(value);
  let out = '';
  for (let index = 0; index < json.length; index += 1) {
    const code = json.charCodeAt(index);
    out += code >= 0x20 && code < 0x7f
      ? json.charAt(index)
      : `\\u${code.toString(16).padStart(4, '0')}`;
  }
  return out;
}

export function registerDataExportRoutes(app: Express, ctx: RegisterDataExportRoutesDeps): void {
  const { sendApiError } = ctx.http;
  const { RUNTIME_DATA_DIR, PROJECTS_DIR } = ctx.paths;
  const { randomUUID } = ctx.ids;

  const staging = new DataExportStagingStore();

  const collectorDeps: DataExportCollectorDeps = {
    db: ctx.db,
    paths: { PROJECTS_DIR, RUNTIME_DATA_DIR },
    projectStore: ctx.projectStore,
    projectFiles: ctx.projectFiles,
    appConfig: ctx.appConfig,
  };

  // -------------------------------------------------------------------------
  // Catalogue
  // -------------------------------------------------------------------------

  app.get('/api/export/formats', (_req, res) => {
    res.json({
      schemaVersion: DATA_EXPORT_SCHEMA_VERSION,
      encoding: DATA_EXPORT_ENCODING,
      lineEnding: DATA_EXPORT_LINE_ENDING,
      producer: DATA_EXPORT_PRODUCER,
      formats: DATA_EXPORT_FORMATS.map((format) => DATA_EXPORT_FORMAT_DESCRIPTORS[format]),
      archives: {
        zip: { available: true, encryption: false },
        // Reported honestly at request time: a missing binary is a refusal, not
        // a silent downgrade to an unencrypted ZIP.
        '7z': { available: resolveSevenZipBinary() !== null, encryption: true, encryptedHeaders: true },
      },
    });
  });

  app.get('/api/export/datasets', (_req, res) => {
    res.json({
      schemaVersion: DATA_EXPORT_SCHEMA_VERSION,
      datasets: DATA_EXPORT_DATASET_IDS.map((id) => ({
        ...DATA_EXPORT_DATASETS[id],
        // Derived from the verdict, never hand-listed: a picker defaulting to a
        // format the run endpoint then refuses with a 409 is worse than no
        // recommendation at all.
        preferredFormats: preferredDataExportFormats(id),
        formats: DATA_EXPORT_FORMATS.map((format) => describeDataExportFidelity(id, format)),
      })),
    });
  });

  // -------------------------------------------------------------------------
  // Plan / run
  // -------------------------------------------------------------------------

  /**
   * Normalize the request body. More than one dataset cannot be one HTTP body,
   * so it gets a ZIP by default — stated in the returned plan rather than
   * applied behind the caller's back.
   */
  function normalizeRequest(body: unknown): { request: DataExportRequest; error?: string } {
    const raw = (body ?? {}) as Partial<DataExportRequest>;
    const format = raw.format;
    if (!isDataExportFormat(format)) {
      return {
        request: { datasets: [], format: 'json' },
        error: `format must be one of: ${DATA_EXPORT_FORMATS.join(', ')}`,
      };
    }

    let datasets: DataExportRequest['datasets'];
    if (raw.datasets === 'all') {
      datasets = 'all';
    } else if (Array.isArray(raw.datasets)) {
      const unknownIds = raw.datasets.filter((id) => !isDataExportDatasetId(id));
      if (unknownIds.length > 0) {
        return {
          request: { datasets: [], format },
          error: `unknown dataset(s): ${unknownIds.map((id) => String(id)).join(', ')}`,
        };
      }
      datasets = raw.datasets as DataExportDatasetId[];
    } else {
      return { request: { datasets: [], format }, error: 'datasets must be an array or "all"' };
    }

    const resolved = resolveDataExportDatasets({ datasets });
    if (resolved.length === 0) {
      return { request: { datasets: [], format }, error: 'datasets selects nothing' };
    }

    const formats: Partial<Record<DataExportDatasetId, DataExportFormat>> = {};
    if (raw.formats && typeof raw.formats === 'object') {
      for (const [id, value] of Object.entries(raw.formats)) {
        if (!isDataExportDatasetId(id)) {
          return { request: { datasets: [], format }, error: `unknown dataset in formats: ${id}` };
        }
        if (!isDataExportFormat(value)) {
          return { request: { datasets: [], format }, error: `unknown format for ${id}: ${String(value)}` };
        }
        formats[id] = value;
      }
    }

    const archive = raw.archive ?? (resolved.length > 1 ? { kind: 'zip' as const } : undefined);
    if (archive && archive.kind !== 'zip' && archive.kind !== '7z') {
      return { request: { datasets: [], format }, error: 'archive.kind must be "zip" or "7z"' };
    }

    return {
      request: {
        datasets,
        format,
        ...(Object.keys(formats).length > 0 ? { formats } : {}),
        ...(raw.filter ? { filter: raw.filter } : {}),
        ...(archive ? { archive } : {}),
        ...(raw.acknowledgeLossy === true ? { acknowledgeLossy: true } : {}),
      },
    };
  }

  function archiveBaseName(generatedAt: string): string {
    const stamp = generatedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    return `od-export-v${DATA_EXPORT_SCHEMA_VERSION}-${stamp}`;
  }

  /**
   * Collect once, plan once. Both `/plan` and the run route call this, so the
   * fidelity verdict, the record counts and the archive switch list a user
   * approved are literally the same objects the run uses.
   */
  async function planAndCollect(
    request: DataExportRequest,
    generatedAt: string,
  ): Promise<{ plan: DataExportPlan; collected: CollectedEntry[]; filter: DataExportFilter }> {
    const { filter, issues } = normalizeDataExportFilter(request.filter);
    if (issues.length > 0) {
      throw new DataExportFilterError(issues[0]?.path ?? 'filter', issues[0]?.message ?? 'invalid filter');
    }

    const plan = buildDataExportPlan(request, {
      generatedAt,
      archiveFileName: archiveBaseName(generatedAt),
    });

    const collected: CollectedEntry[] = [];
    for (const entry of plan.entries) {
      const result = await collectDataExportDataset(entry.dataset, collectorDeps, filter);
      entry.recordCount = result.records.length;

      // Everything the run itself could not carry, gathered per dataset. These
      // go into the plan (so a preview shows them), into that dataset's own
      // envelope (so a self-describing file states them inline) and into a
      // response header (so a CSV or JSONL export still reports them).
      const warnings: DataExportPlan['warnings'] = [];
      const ignoredFilters = entry.ignoredFilters ?? [];
      if (ignoredFilters.length > 0) {
        warnings.push({
          code: 'filters-ignored',
          severity: 'warning',
          dataset: entry.dataset,
          format: entry.format,
          message:
            `This dataset does not understand the filter key(s) ${ignoredFilters.join(', ')}, so they were ` +
            'not applied and the records are unscoped by them. The exported file states only the scope it ' +
            'really had, rather than repeating a filter that never reached this dataset.',
        });
      }
      if (result.ceilingReached) {
        warnings.push({
          code: 'record-ceiling-reached',
          severity: 'warning',
          dataset: entry.dataset,
          format: entry.format,
          message:
            'The underlying scan stopped at the record ceiling, so this export is a prefix of the matching rows ' +
            'rather than all of them. Narrow the filter (project, conversation, date range) and export again.',
        });
      }
      for (const projectId of result.skippedProjects) {
        warnings.push({
          code: 'source-unreadable',
          severity: 'warning',
          dataset: entry.dataset,
          format: entry.format,
          message:
            `The file inventory for project ${projectId} could not be read, so its files are absent from this ` +
            'export. The record count is what was readable, not what exists.',
        });
      }

      collected.push({
        dataset: entry.dataset,
        records: result.records,
        complete: !result.ceilingReached && result.skippedProjects.length === 0,
        warnings,
      });
      plan.warnings.push(...warnings);
    }
    plan.requiresAcknowledgement = plan.warnings.some((warning) => warning.severity === 'blocking');
    return { plan, collected, filter };
  }

  function envelopeFor(
    entry: CollectedEntry,
    plan: DataExportPlan,
    filter: DataExportFilter,
  ): DataExportEnvelope {
    const dataset = entry.dataset;
    const planEntry = plan.entries.find((candidate) => candidate.dataset === dataset);
    const format = planEntry ? planEntry.format : 'json';
    return {
      schemaVersion: DATA_EXPORT_SCHEMA_VERSION,
      encoding: DATA_EXPORT_ENCODING,
      lineEnding: DATA_EXPORT_LINE_ENDING,
      generatedAt: plan.generatedAt,
      dataset,
      datasetLabel: DATA_EXPORT_DATASETS[dataset].label,
      format,
      recordCount: entry.records.length,
      fields: DATA_EXPORT_DATASETS[dataset].fields,
      // Only the keys this dataset applied. Embedding the caller's whole filter
      // would have a `settings` file claim `projectId: p1` while holding every
      // setting in the daemon — a file asserting a scope it never had.
      filter: applicableDataExportFilter(dataset, filter),
      ignoredFilters: planEntry?.ignoredFilters ?? [],
      complete: entry.complete,
      warnings: entry.warnings,
      // The plan's own verdict rather than a fresh one, so the file cannot
      // disagree with the preview the caller approved.
      fidelity: planEntry ? planEntry.fidelity : describeDataExportFidelity(dataset, format),
      producer: DATA_EXPORT_PRODUCER,
    };
  }

  function sendFilterError(res: Response, error: unknown): Response {
    if (error instanceof DataExportFilterError) {
      return sendApiError(res, 400, 'VALIDATION_FAILED', error.message, {
        details: { kind: 'validation', issues: [{ path: error.path, message: error.message }] },
      });
    }
    return sendApiError(
      res,
      500,
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : String(error),
    );
  }

  app.post('/api/export/plan', async (req, res) => {
    const { request, error } = normalizeRequest(req.body);
    if (error) return sendApiError(res, 400, 'BAD_REQUEST', error);
    try {
      const { plan } = await planAndCollect(request, new Date().toISOString());
      return res.json(plan);
    } catch (caught) {
      return sendFilterError(res, caught);
    }
  });

  app.post('/api/export', async (req, res) => {
    const { request, error } = normalizeRequest(req.body);
    if (error) return sendApiError(res, 400, 'BAD_REQUEST', error);

    // A ZIP written here is never encrypted. Accepting a password and quietly
    // dropping it would hand the user a file they believe is protected, so this
    // is a refusal that no acknowledgement can override.
    if (request.archive?.kind === 'zip' && request.archive.sevenZip?.password) {
      return sendApiError(
        res,
        400,
        'BAD_REQUEST',
        'ZIP archives are written without encryption, so a password cannot be honoured here. ' +
          'Use archive.kind "7z", which encrypts both the content and the filenames with AES-256.',
      );
    }

    if (request.archive?.kind === '7z') {
      const validation = validateSevenZipOptions(request.archive.sevenZip ?? {});
      if (!validation.ok) {
        return sendApiError(res, 400, 'BAD_REQUEST', validation.issues[0]?.message ?? 'invalid 7z options', {
          details: {
            kind: 'validation',
            issues: validation.issues.map((issue) => ({ path: issue.path, message: issue.message })),
          },
        });
      }
      if (resolveSevenZipBinary() === null) {
        return sendApiError(
          res,
          501,
          'EXPORT_ARCHIVE_UNAVAILABLE',
          'no 7-Zip binary is reachable from the daemon, so an encrypted archive cannot be produced. ' +
            'The export was not silently written as an unencrypted ZIP instead.',
        );
      }
    }

    const generatedAt = new Date().toISOString();
    let plan: DataExportPlan;
    let collected: CollectedEntry[];
    let filter: DataExportFilter;
    try {
      const result = await planAndCollect(request, generatedAt);
      plan = result.plan;
      collected = result.collected;
      filter = result.filter;
    } catch (caught) {
      return sendFilterError(res, caught);
    }

    if (plan.requiresAcknowledgement && request.acknowledgeLossy !== true) {
      return sendApiError(
        res,
        409,
        'EXPORT_LOSSY_UNACKNOWLEDGED',
        'this export would lose data in the chosen format. Review the plan and re-send with acknowledgeLossy: true.',
        { details: plan as unknown as JsonValue },
      );
    }

    const documents = collected.map((entry) => {
      const envelope = envelopeFor(entry, plan, filter);
      const planEntry = plan.entries.find((candidate) => candidate.dataset === entry.dataset);
      return {
        dataset: entry.dataset,
        format: envelope.format,
        fileName: planEntry?.fileName ?? dataExportFileName(entry.dataset, envelope.format, generatedAt),
        mediaType: planEntry?.mediaType ?? 'application/octet-stream',
        recordCount: entry.records.length,
        complete: envelope.complete,
        body: serializeDataExport({ envelope, records: entry.records }),
      };
    });

    // Single dataset, no archive: stream the document itself. The envelope that
    // a non-self-describing format (JSONL, CSV, TSV) cannot carry inline
    // travels in these headers instead — including whether the file is the whole
    // result and everything the run could not carry, so a truncated export is
    // never handed over looking complete.
    const archive = request.archive;
    if (!archive) {
      const only = documents[0];
      if (!only) return sendApiError(res, 400, 'BAD_REQUEST', 'datasets selects nothing');
      res.setHeader('Content-Type', only.mediaType);
      res.setHeader('X-OD-Export-Schema-Version', String(DATA_EXPORT_SCHEMA_VERSION));
      res.setHeader('X-OD-Export-Encoding', DATA_EXPORT_ENCODING);
      res.setHeader('X-OD-Export-Line-Ending', DATA_EXPORT_LINE_ENDING);
      res.setHeader('X-OD-Export-Dataset', only.dataset);
      res.setHeader('X-OD-Export-Format', only.format);
      res.setHeader('X-OD-Export-Record-Count', String(only.recordCount));
      res.setHeader('X-OD-Export-Complete', String(only.complete));
      // The count always travels; the detail travels while it fits. An HTTP
      // client refuses to parse a response whose headers exceed its budget, and
      // a header the client rejects reports nothing at all — so an oversized
      // list degrades to the count plus `/api/export/plan`, never to silence.
      const encodedWarnings = asciiJsonHeader(plan.warnings);
      res.setHeader('X-OD-Export-Warning-Count', String(plan.warnings.length));
      if (encodedWarnings.length <= WARNING_HEADER_BUDGET) {
        res.setHeader('X-OD-Export-Warnings', encodedWarnings);
      }
      res.setHeader('X-OD-Export-Generated-At', generatedAt);
      res.setHeader('X-OD-Export-Producer', DATA_EXPORT_PRODUCER);
      res.setHeader('Content-Disposition', `attachment; filename="${only.fileName}"`);
      return res.send(only.body);
    }

    // An archive's warnings live in `manifest.json` and `README.md` inside it,
    // where there is no size budget. The headers carry only the two facts a
    // client needs before opening it — a full warning list for twelve datasets
    // would run past the 16 KiB header budget an HTTP client will parse, and a
    // header the client rejects reports nothing at all.
    const archiveComplete = documents.every((document) => document.complete);

    const entries: DataExportArchiveEntry[] = documents.map((document) => ({
      path: document.fileName,
      content: document.body,
    }));
    entries.push({ path: 'manifest.json', content: JSON.stringify(buildArchiveManifest(plan, documents), null, 2) + '\n' });
    entries.push({ path: 'README.md', content: buildArchiveReadme(plan, documents) });

    const baseName = archiveBaseName(generatedAt);
    try {
      if (archive.kind === 'zip') {
        const buffer = await buildDataExportZip(entries);
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${baseName}.zip"`);
        res.setHeader('X-OD-Export-Schema-Version', String(DATA_EXPORT_SCHEMA_VERSION));
        res.setHeader('X-OD-Export-Complete', String(archiveComplete));
        res.setHeader('X-OD-Export-Warning-Count', String(plan.warnings.length));
        return res.send(buffer);
      }

      const result = await buildDataExportSevenZip(
        entries,
        validateSevenZipOptions(archive.sevenZip ?? {}).resolved,
        { runtimeDataDir: RUNTIME_DATA_DIR, baseName },
      );
      const single = result.files.length === 1 ? result.files[0] : undefined;
      if (single) {
        const buffer = await readSevenZipArtifact(result.directory, single.name);
        // Read fully into memory, then drop the staging tree: an archive that
        // may carry an encrypted payload should not linger on disk once the
        // response owns the bytes.
        await disposeSevenZipArtifacts(result.directory);
        res.setHeader('Content-Type', 'application/x-7z-compressed');
        res.setHeader('Content-Disposition', `attachment; filename="${single.name}"`);
        res.setHeader('X-OD-Export-Schema-Version', String(DATA_EXPORT_SCHEMA_VERSION));
        res.setHeader('X-OD-Export-Complete', String(archiveComplete));
        res.setHeader('X-OD-Export-Warning-Count', String(plan.warnings.length));
        res.setHeader('X-OD-Export-7z-Switches', result.switches.join(' '));
        return res.send(buffer);
      }

      // Split volumes cannot be one HTTP body. They are staged under the daemon
      // data root and handed back as a manifest of per-volume download URLs.
      // The header is what tells a client this JSON is a manifest rather than a
      // `--format json` export document, which is also `application/json`.
      const token = String(randomUUID());
      staging.add(token, result.directory, result.files);
      res.setHeader('X-OD-Export-Volumes', String(result.files.length));
      return res.json({
        ok: true,
        archive: { kind: '7z', fileName: `${baseName}.7z`, volumes: result.files, token },
        switches: result.switches,
        downloadPaths: result.files.map((file) => `/api/export/staged/${token}/${file.name}`),
        note:
          'This archive was split into volumes. Download every volume into the same directory before extracting; ' +
          'a missing volume makes the whole archive unreadable.',
        warnings: plan.warnings,
      });
    } catch (caught) {
      if (caught instanceof DataExportArchiveError) {
        const status = caught.code === 'BINARY_UNAVAILABLE' ? 501 : caught.code === 'UNSAFE_PATH' ? 400 : 500;
        const code =
          caught.code === 'BINARY_UNAVAILABLE'
            ? 'EXPORT_ARCHIVE_UNAVAILABLE'
            : caught.code === 'UNSAFE_PATH'
              ? 'BAD_REQUEST'
              : 'EXPORT_ARCHIVE_FAILED';
        return sendApiError(res, status, code, caught.message);
      }
      return sendApiError(
        res,
        500,
        'EXPORT_ARCHIVE_FAILED',
        caught instanceof Error ? caught.message : String(caught),
      );
    }
  });

  app.get('/api/export/staged/:token/:name', async (req, res) => {
    const staged = staging.get(String(req.params.token));
    if (!staged) return sendApiError(res, 404, 'NOT_FOUND', 'staged export has expired or does not exist');
    const name = String(req.params.name);
    if (!staged.files.some((file) => file.name === name)) {
      return sendApiError(res, 404, 'NOT_FOUND', 'no such volume in this staged export');
    }
    try {
      const buffer = await readSevenZipArtifact(staged.directory, name);
      res.setHeader('Content-Type', 'application/x-7z-compressed');
      res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
      return res.send(buffer);
    } catch (caught) {
      return sendApiError(
        res,
        caught instanceof DataExportArchiveError && caught.code === 'UNSAFE_PATH' ? 400 : 500,
        caught instanceof DataExportArchiveError && caught.code === 'UNSAFE_PATH'
          ? 'BAD_REQUEST'
          : 'INTERNAL_ERROR',
        caught instanceof Error ? caught.message : String(caught),
      );
    }
  });
}

interface ArchiveDocumentSummary {
  dataset: DataExportDatasetId;
  format: string;
  fileName: string;
  recordCount: number;
  /** False when the file holds a prefix of the result rather than all of it. */
  complete: boolean;
}

/**
 * The archive's own schema statement. A reader who opens the zip years later
 * finds the encoding, line ending, schema version, per-file dataset and the
 * exact escaping conventions without needing the app that wrote it.
 */
function buildArchiveManifest(plan: DataExportPlan, documents: readonly ArchiveDocumentSummary[]) {
  return {
    producer: DATA_EXPORT_PRODUCER,
    schemaVersion: DATA_EXPORT_SCHEMA_VERSION,
    encoding: DATA_EXPORT_ENCODING,
    lineEnding: DATA_EXPORT_LINE_ENDING,
    generatedAt: plan.generatedAt,
    files: documents.map((document) => ({
      path: document.fileName,
      dataset: document.dataset,
      datasetLabel: DATA_EXPORT_DATASETS[document.dataset].label,
      format: document.format,
      recordCount: document.recordCount,
      // Stated per file: `recordCount` alone cannot tell a complete export from
      // a prefix that stopped at the record ceiling.
      complete: document.complete,
      fields: DATA_EXPORT_DATASETS[document.dataset].fields,
    })),
    conventions: {
      csv: 'RFC 4180. A value containing a comma, quote, CR or LF is double-quoted; an embedded quote is doubled.',
      tsv: 'Tab-delimited. Backslash, tab, CR and LF inside a value are escaped as \\\\, \\t, \\r and \\n.',
      jsonl: 'One JSON record per line, no envelope. The schema for each file is in this manifest.',
      toml: 'TOML 1.0. Null-valued fields are omitted from their record table; consult the field list above.',
      xml: 'Field names are attributes, never element names. A null field carries null="true".',
    },
    warnings: plan.warnings,
  };
}

function buildArchiveReadme(plan: DataExportPlan, documents: readonly ArchiveDocumentSummary[]): string {
  const lines: string[] = [
    '# Open Design data export',
    '',
    `- Schema version: ${DATA_EXPORT_SCHEMA_VERSION}`,
    `- Encoding: ${DATA_EXPORT_ENCODING}`,
    '- Line endings: LF (`\\n`), including on Windows',
    `- Generated: ${plan.generatedAt}`,
    `- Producer: ${DATA_EXPORT_PRODUCER}`,
    '',
    '`manifest.json` carries the full field list for every file, so each file is readable',
    'by something other than the app that wrote it.',
    '',
    '## Files',
    '',
    '| File | Dataset | Format | Records | Complete |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const document of documents) {
    lines.push(
      `| \`${document.fileName}\` | ${DATA_EXPORT_DATASETS[document.dataset].label} | ${document.format} | ${document.recordCount} | ${document.complete ? 'yes' : 'no — see below'} |`,
    );
  }
  if (plan.warnings.length > 0) {
    lines.push('', '## What this export could not carry', '');
    for (const warning of plan.warnings) {
      const scope = warning.dataset ? `${warning.dataset}/${warning.format ?? ''} — ` : '';
      lines.push(`- **${warning.severity}** (${warning.code}) ${scope}${warning.message}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}
