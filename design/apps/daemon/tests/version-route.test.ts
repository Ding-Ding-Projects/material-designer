import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../src/server.js';

describe('/api/version', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('returns current app version info', async () => {
    const previous = {
      buildVersion: process.env.OD_BUILD_VERSION,
      sourceCommit: process.env.OD_BUILD_SOURCE_COMMIT,
      updatedAt: process.env.OD_BUILD_UPDATED_AT,
    };
    delete process.env.OD_BUILD_VERSION;
    delete process.env.OD_BUILD_SOURCE_COMMIT;
    delete process.env.OD_BUILD_UPDATED_AT;
    try {
      const res = await fetch(`${baseUrl}/api/version`);
      const json = await res.json() as unknown;

      expect(res.ok).toBe(true);
      expect(json).toEqual({
        version: {
          version: expect.any(String),
          channel: expect.any(String),
          packaged: expect.any(Boolean),
          platform: expect.any(String),
          arch: expect.any(String),
          provenance: null,
        },
      });
    } finally {
      if (previous.buildVersion === undefined) delete process.env.OD_BUILD_VERSION;
      else process.env.OD_BUILD_VERSION = previous.buildVersion;
      if (previous.sourceCommit === undefined) delete process.env.OD_BUILD_SOURCE_COMMIT;
      else process.env.OD_BUILD_SOURCE_COMMIT = previous.sourceCommit;
      if (previous.updatedAt === undefined) delete process.env.OD_BUILD_UPDATED_AT;
      else process.env.OD_BUILD_UPDATED_AT = previous.updatedAt;
    }
  });

  it('returns verified provenance when the external record matches the package', async () => {
    const previous = {
      appVersion: process.env.OD_APP_VERSION,
      buildVersion: process.env.OD_BUILD_VERSION,
      sourceCommit: process.env.OD_BUILD_SOURCE_COMMIT,
      updatedAt: process.env.OD_BUILD_UPDATED_AT,
    };
    process.env.OD_APP_VERSION = '1.2.3';
    process.env.OD_BUILD_VERSION = '1.2.3';
    process.env.OD_BUILD_SOURCE_COMMIT = 'abcdef0123456789abcdef0123456789abcdef01';
    process.env.OD_BUILD_UPDATED_AT = '2026-08-27T12:34:56.000Z';
    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
    };
    try {
      const res = await fetch(`${started.url}/api/version`);
      const json = await res.json() as { version?: { provenance?: unknown } };
      expect(res.ok).toBe(true);
      expect(json.version?.provenance).toEqual({
        schemaVersion: 1,
        version: '1.2.3',
        sourceCommit: 'abcdef0123456789abcdef0123456789abcdef01',
        updatedAt: '2026-08-27T12:34:56.000Z',
      });
    } finally {
      await new Promise<void>((resolve) => started.server.close(() => resolve()));
      if (previous.appVersion === undefined) delete process.env.OD_APP_VERSION;
      else process.env.OD_APP_VERSION = previous.appVersion;
      if (previous.buildVersion === undefined) delete process.env.OD_BUILD_VERSION;
      else process.env.OD_BUILD_VERSION = previous.buildVersion;
      if (previous.sourceCommit === undefined) delete process.env.OD_BUILD_SOURCE_COMMIT;
      else process.env.OD_BUILD_SOURCE_COMMIT = previous.sourceCommit;
      if (previous.updatedAt === undefined) delete process.env.OD_BUILD_UPDATED_AT;
      else process.env.OD_BUILD_UPDATED_AT = previous.updatedAt;
    }
  });

  it('keeps health version aligned with version endpoint', async () => {
    const [healthRes, versionRes] = await Promise.all([
      fetch(`${baseUrl}/api/health`),
      fetch(`${baseUrl}/api/version`),
    ]);
    const health = await healthRes.json() as { ok?: unknown; version?: unknown };
    const version = await versionRes.json() as { version?: { version?: unknown } };

    expect(healthRes.ok).toBe(true);
    expect(versionRes.ok).toBe(true);
    expect(health).toEqual({ ok: true, version: version.version?.version });
  });
});
