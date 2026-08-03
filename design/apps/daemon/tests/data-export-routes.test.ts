// `/api/export/*` — the daemon half of "export everything, in every format
// that can faithfully represent it".
//
// The daemon under test runs against the isolated data directory tests/setup.ts
// provisions, so the datasets are empty. That is fine and deliberate: what these
// tests pin is the contract — the format matrix, the refusal to write a
// silently-damaged file, the archive envelope, and the header-borne schema for
// the formats that cannot carry one inline.

import type http from 'node:http';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DATA_EXPORT_DATASET_IDS,
  DATA_EXPORT_FORMATS,
  DATA_EXPORT_SCHEMA_VERSION,
} from '@open-design/contracts';
import { startServer } from '../src/server.js';

let server: http.Server;
let baseUrl: string;
let shutdown: (() => Promise<void> | void) | undefined;
let sevenZipAvailable = false;

beforeAll(async () => {
  const started = (await startServer({ port: 0, returnServer: true })) as {
    url: string;
    server: http.Server;
    shutdown?: () => Promise<void> | void;
  };
  baseUrl = started.url;
  server = started.server;
  shutdown = started.shutdown;

  const formats = (await (await fetch(`${baseUrl}/api/export/formats`)).json()) as {
    archives?: Record<string, { available?: boolean }>;
  };
  sevenZipAvailable = formats.archives?.['7z']?.available === true;
});

afterAll(async () => {
  await Promise.resolve(shutdown?.());
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function postExport(body: unknown, path = '/api/export') {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/export/formats', () => {
  it('publishes the whole format matrix and the archive capabilities', async () => {
    const resp = await fetch(`${baseUrl}/api/export/formats`);
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      schemaVersion: number;
      encoding: string;
      lineEnding: string;
      formats: Array<{ id: string; extension: string; mediaType: string; note: string }>;
      archives: Record<string, { available: boolean; encryption: boolean }>;
    };
    expect(body.schemaVersion).toBe(DATA_EXPORT_SCHEMA_VERSION);
    expect(body.encoding).toBe('utf-8');
    expect(body.lineEnding).toBe('lf');
    expect(body.formats.map((format) => format.id).sort()).toEqual([...DATA_EXPORT_FORMATS].sort());
    expect(body.archives.zip?.available).toBe(true);
    // ZIP here is never encrypted, and says so rather than implying otherwise.
    expect(body.archives.zip?.encryption).toBe(false);
    expect(body.archives['7z']?.encryption).toBe(true);
  });
});

describe('GET /api/export/datasets', () => {
  it('enumerates every dataset with a per-format fidelity verdict', async () => {
    const resp = await fetch(`${baseUrl}/api/export/datasets`);
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      datasets: Array<{
        id: string;
        label: string;
        shape: string;
        fields: Array<{ name: string; type: string; nullable: boolean }>;
        preferredFormats: string[];
        formats: Array<{ format: string; level: string; warnings: unknown[] }>;
      }>;
    };
    expect(body.datasets.map((dataset) => dataset.id).sort()).toEqual(
      [...DATA_EXPORT_DATASET_IDS].sort(),
    );
    for (const dataset of body.datasets) {
      expect(dataset.fields.length).toBeGreaterThan(0);
      expect(dataset.formats).toHaveLength(DATA_EXPORT_FORMATS.length);
      expect(dataset.formats.some((entry) => entry.level !== 'lossy')).toBe(true);
      // The recommendation a format picker reads is derived from the verdict the
      // same response carries, so it can never point at a format the run
      // endpoint would refuse with a 409.
      for (const preferred of dataset.preferredFormats) {
        const verdict = dataset.formats.find((entry) => entry.format === preferred);
        expect(verdict?.level, `${dataset.id}/${preferred}`).toBe('faithful');
      }
    }
  });
});

describe('POST /api/export/plan', () => {
  it('says what a lossy format would cost, and writes nothing', async () => {
    const resp = await postExport({ datasets: ['projects'], format: 'toml' }, '/api/export/plan');
    expect(resp.status).toBe(200);
    const plan = (await resp.json()) as {
      requiresAcknowledgement: boolean;
      entries: Array<{ dataset: string; format: string; fileName: string; recordCount: number }>;
      warnings: Array<{ code: string; severity: string; fields?: string[] }>;
    };
    expect(plan.requiresAcknowledgement).toBe(true);
    expect(plan.entries[0]?.dataset).toBe('projects');
    expect(plan.entries[0]?.fileName).toContain(`v${DATA_EXPORT_SCHEMA_VERSION}`);
    expect(typeof plan.entries[0]?.recordCount).toBe('number');
    const blocking = plan.warnings.find((warning) => warning.severity === 'blocking');
    expect(blocking?.code).toBe('null-fields-omitted');
    expect(blocking?.fields).toContain('metadata');
  });

  it('reports the filters a dataset will ignore rather than dropping them silently', async () => {
    const resp = await postExport(
      { datasets: ['agent-sessions'], format: 'json', filter: { projectId: 'p1' } },
      '/api/export/plan',
    );
    expect(resp.status).toBe(200);
    const plan = (await resp.json()) as { entries: Array<{ ignoredFilters?: string[] }> };
    expect(plan.entries[0]?.ignoredFilters).toContain('projectId');
  });
});

describe('POST /api/export', () => {
  it('refuses a lossy format until the caller has acknowledged the plan', async () => {
    const resp = await postExport({ datasets: ['projects'], format: 'toml' });
    expect(resp.status).toBe(409);
    const body = (await resp.json()) as {
      error: { code: string; message: string; details?: { warnings?: Array<{ code: string }> } };
    };
    expect(body.error.code).toBe('EXPORT_LOSSY_UNACKNOWLEDGED');
    // The plan travels with the refusal, so the caller can see the cost.
    expect(body.error.details?.warnings?.some((warning) => warning.code === 'null-fields-omitted')).toBe(
      true,
    );
  });

  it('runs the same request once it is acknowledged', async () => {
    const resp = await postExport({
      datasets: ['projects'],
      format: 'toml',
      acknowledgeLossy: true,
    });
    expect(resp.status).toBe(200);
    expect(resp.headers.get('content-type')).toContain('application/toml');
    const body = await resp.text();
    expect(body).toContain(`schemaVersion = ${DATA_EXPORT_SCHEMA_VERSION}`);
    expect(body).toContain('schemaJson = ');
  });

  it('streams a faithful JSON document with the schema in the body and the headers', async () => {
    const resp = await postExport({ datasets: ['projects'], format: 'json' });
    expect(resp.status).toBe(200);
    expect(resp.headers.get('content-type')).toContain('application/json');
    expect(resp.headers.get('x-od-export-schema-version')).toBe(String(DATA_EXPORT_SCHEMA_VERSION));
    expect(resp.headers.get('x-od-export-encoding')).toBe('utf-8');
    expect(resp.headers.get('x-od-export-line-ending')).toBe('lf');
    expect(resp.headers.get('x-od-export-dataset')).toBe('projects');
    expect(resp.headers.get('content-disposition')).toContain('od-export-projects-v1-');

    const body = (await resp.json()) as {
      schemaVersion: number;
      encoding: string;
      records: unknown[];
      fields: Array<{ name: string }>;
    };
    expect(body.schemaVersion).toBe(DATA_EXPORT_SCHEMA_VERSION);
    expect(Array.isArray(body.records)).toBe(true);
    expect(body.fields.map((field) => field.name)).toContain('metadata');
  });

  it('carries the schema in headers for a format that cannot hold it inline', async () => {
    const resp = await postExport({ datasets: ['tabs'], format: 'csv' });
    expect(resp.status).toBe(200);
    expect(resp.headers.get('content-type')).toContain('text/csv');
    expect(resp.headers.get('x-od-export-schema-version')).toBe(String(DATA_EXPORT_SCHEMA_VERSION));
    expect(resp.headers.get('x-od-export-record-count')).toBeTruthy();
    // A CSV has nowhere inside it to say "this is a prefix", so the run states
    // completeness and every run warning in headers a client can read.
    expect(resp.headers.get('x-od-export-complete')).toBe('true');
    const warnings = JSON.parse(resp.headers.get('x-od-export-warnings') ?? 'null');
    expect(Array.isArray(warnings)).toBe(true);
    const text = await resp.text();
    expect(text.split('\n')[0]).toBe('projectId,name,position,isActive');
  });

  it('never embeds a filter key the dataset ignores, and says it was ignored', async () => {
    // `settings` reads no project column. Embedding `projectId` in its envelope
    // would produce a file asserting a scope it never applied while holding
    // every setting in the daemon.
    const resp = await postExport({
      datasets: ['settings'],
      format: 'json',
      filter: { projectId: 'p1' },
    });
    expect(resp.status).toBe(200);

    const headerWarnings = JSON.parse(resp.headers.get('x-od-export-warnings') ?? '[]') as Array<{
      code: string;
    }>;
    expect(headerWarnings.some((warning) => warning.code === 'filters-ignored')).toBe(true);

    const body = (await resp.json()) as {
      filter: Record<string, unknown>;
      ignoredFilters: string[];
      complete: boolean;
      warnings: Array<{ code: string; message: string }>;
    };
    expect(body.filter.projectId).toBeUndefined();
    expect(body.ignoredFilters).toContain('projectId');
    expect(body.complete).toBe(true);
    const ignored = body.warnings.find((warning) => warning.code === 'filters-ignored');
    expect(ignored?.message).toContain('projectId');
  });

  it('honours a per-datum format inside one request', async () => {
    const resp = await postExport({
      datasets: ['tabs', 'projects'],
      format: 'json',
      formats: { tabs: 'csv' },
    });
    expect(resp.status).toBe(200);
    expect(resp.headers.get('content-type')).toContain('application/zip');
    const zip = await JSZip.loadAsync(Buffer.from(await resp.arrayBuffer()));
    const names = Object.keys(zip.files);
    expect(names.some((name) => name.endsWith('.csv'))).toBe(true);
    expect(names.some((name) => name.endsWith('.json') && name.includes('projects'))).toBe(true);
  });

  it('packs more than one dataset into a ZIP that states its own schema', async () => {
    const resp = await postExport({ datasets: ['projects', 'conversations'], format: 'json' });
    expect(resp.status).toBe(200);
    expect(resp.headers.get('content-type')).toContain('application/zip');

    const zip = await JSZip.loadAsync(Buffer.from(await resp.arrayBuffer()));
    const names = Object.keys(zip.files).sort();
    expect(names).toContain('manifest.json');
    expect(names).toContain('README.md');
    for (const name of names) {
      expect(name.startsWith('/')).toBe(false);
      expect(name.includes('..')).toBe(false);
    }

    const manifest = JSON.parse((await zip.file('manifest.json')?.async('string')) ?? '{}') as {
      schemaVersion: number;
      encoding: string;
      lineEnding: string;
      files: Array<{ path: string; dataset: string; fields: unknown[] }>;
      conventions: Record<string, string>;
    };
    expect(manifest.schemaVersion).toBe(DATA_EXPORT_SCHEMA_VERSION);
    expect(manifest.encoding).toBe('utf-8');
    expect(manifest.lineEnding).toBe('lf');
    expect(manifest.files.map((file) => file.dataset).sort()).toEqual(['conversations', 'projects']);
    expect(manifest.conventions.csv).toContain('RFC 4180');

    const readme = (await zip.file('README.md')?.async('string')) ?? '';
    expect(readme).toContain('Line endings: LF');
  });

  it('will not pretend a ZIP can be password protected, even if acknowledged', async () => {
    for (const acknowledgeLossy of [false, true]) {
      const resp = await postExport({
        datasets: ['projects'],
        format: 'json',
        archive: { kind: 'zip', sevenZip: { password: 'hunter2' } },
        acknowledgeLossy,
      });
      expect(resp.status).toBe(400);
      const body = (await resp.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe('BAD_REQUEST');
      expect(body.error.message).toContain('7z');
    }
  });

  it('still shows the ZIP-password problem as a blocking warning in the plan', async () => {
    const resp = await postExport(
      {
        datasets: ['projects'],
        format: 'json',
        archive: { kind: 'zip', sevenZip: { password: 'hunter2' } },
      },
      '/api/export/plan',
    );
    expect(resp.status).toBe(200);
    const plan = (await resp.json()) as {
      requiresAcknowledgement: boolean;
      warnings: Array<{ code: string; severity: string }>;
    };
    expect(plan.requiresAcknowledgement).toBe(true);
    expect(
      plan.warnings.some(
        (warning) =>
          warning.code === 'archive-encryption-unsupported' && warning.severity === 'blocking',
      ),
    ).toBe(true);
  });

  it('rejects an unknown dataset and an unknown format by name', async () => {
    const unknownDataset = await postExport({ datasets: ['nope'], format: 'json' });
    expect(unknownDataset.status).toBe(400);
    expect((await unknownDataset.json()).error.message).toContain('nope');

    const unknownFormat = await postExport({ datasets: ['projects'], format: 'parquet' });
    expect(unknownFormat.status).toBe(400);
    expect((await unknownFormat.json()).error.message).toContain('format must be one of');
  });

  it('reports an invalid regular expression instead of returning an empty export', async () => {
    const resp = await postExport({
      datasets: ['projects'],
      format: 'json',
      filter: { query: '([unclosed', regex: true },
    });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.message).toContain('invalid regular expression');
  });

  it('rejects a stateful regex flag', async () => {
    const resp = await postExport({
      datasets: ['projects'],
      format: 'json',
      filter: { query: 'x', regex: true, regexFlags: 'g' },
    });
    expect(resp.status).toBe(400);
  });

  it('refuses a 7z archive outright when no binary is reachable', async () => {
    const resp = await postExport({
      datasets: ['projects'],
      format: 'json',
      archive: { kind: '7z', sevenZip: { level: 9 } },
    });
    if (sevenZipAvailable) {
      // A machine with 7-Zip installed produces a real archive instead.
      expect([200, 500]).toContain(resp.status);
      return;
    }
    expect(resp.status).toBe(501);
    const body = (await resp.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('EXPORT_ARCHIVE_UNAVAILABLE');
    expect(body.error.message).toContain('unencrypted ZIP');
  });

  it('rejects malformed 7z options before spawning anything', async () => {
    const resp = await postExport({
      datasets: ['projects'],
      format: 'json',
      archive: { kind: '7z', sevenZip: { dictionarySize: '64mb' } },
    });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error: { message: string } };
    expect(body.error.message).toContain('dictionarySize');
  });
});

describe('GET /api/export/staged/:token/:name', () => {
  it('404s an unknown or expired staging token', async () => {
    const resp = await fetch(`${baseUrl}/api/export/staged/no-such-token/od-export-v1.7z.001`);
    expect(resp.status).toBe(404);
  });
});
