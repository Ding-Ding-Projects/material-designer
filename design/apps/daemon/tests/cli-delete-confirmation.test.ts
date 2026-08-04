// Contract test for the destructive-delete gate on the `od … delete` verbs.
//
// The web UI puts these same operations behind the two-key-plus-slider gate in
// `apps/web/src/components/destructive/`. That gate lives in the web layer
// only, so the CLI reached the daemon route around it — every `od … delete`
// used to fire the DELETE on the first invocation with no confirmation of any
// kind. `docs/standards/super-confirmation.md` calls for the gate at the
// operation rather than at the affordance; the CLI's form of it is the
// `--confirm` flag already established by `od plugin events purge`.
//
// The three properties under test, per verb:
//   1. without --confirm it refuses, exits 2, and emits NO HTTP request at all
//      (the refusal happens before the fetch, so nothing reaches the daemon);
//   2. under --json the refusal is the machine-readable
//      `{ error: { code: 'confirmation-required', ... } }` envelope on stderr,
//      still exit 2, so a headless caller can branch on it instead of scraping
//      prose (AGENTS.md "Capability exposure" — the CLI is the embeddability
//      contract);
//   3. with --confirm the original DELETE goes through unchanged.
//
// Like the neighbouring `cli-templates.test.ts`, this drives the real CLI
// entrypoint against a stub HTTP server rather than booting the full daemon:
// that is enough to prove SUBCOMMAND_MAP routing, parseFlags acceptance of
// --confirm, and the exact request emitted (or not emitted) per verb.

import http from 'node:http';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as pathResolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const execFileP = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const DAEMON_ROOT = pathResolve(__dirname, '..');
const REPO_ROOT = pathResolve(__dirname, '../../..');
const CLI_SRC = pathResolve(__dirname, '../src/cli.ts');
const TSX_CLI = pathResolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs');

interface CapturedRequest {
  method: string;
  url: string;
}

interface StubServer {
  baseUrl: string;
  requests: CapturedRequest[];
  close: () => Promise<void>;
}

async function startStubServer(): Promise<StubServer> {
  const requests: CapturedRequest[] = [];

  const server = http.createServer((req, res) => {
    req.on('data', () => {});
    req.on('end', () => {
      requests.push({ method: req.method ?? '', url: req.url ?? '' });
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
    });
  });

  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('stub server has no address');

  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    requests,
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        server.close((err) => (err ? rejectClose(err) : resolveClose()));
      }),
  };
}

async function runCli(
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.NODE_OPTIONS;
  // Never let an ambient daemon URL leak in: every case here pins
  // --daemon-url at the stub so an escaped DELETE is observable.
  delete env.OD_DAEMON_URL;
  try {
    const { stdout, stderr } = await execFileP(
      process.execPath,
      [TSX_CLI, CLI_SRC, ...args],
      // Below vitest's 20s testTimeout so a hung CLI surfaces as a readable
      // "exited null" rather than as an opaque suite timeout.
      { cwd: DAEMON_ROOT, env, timeout: 15_000, maxBuffer: 4 * 1024 * 1024 },
    );
    return { stdout, stderr, code: 0 };
  } catch (err) {
    const failed = err as { stdout?: string; stderr?: string; code?: number | null };
    return { stdout: failed.stdout ?? '', stderr: failed.stderr ?? '', code: failed.code ?? 1 };
  }
}

interface GatedVerb {
  /** Human label used in the test title. */
  name: string;
  /** Args before the shared `--daemon-url <stub>` tail. */
  args: string[];
  /** The request the daemon must see once --confirm is supplied. */
  expected: CapturedRequest;
  /** A fragment of the refusal that must name what would be destroyed. */
  namesTarget: RegExp;
}

// One entry per confirmed ungated call site in apps/daemon/src/cli.ts.
const GATED_VERBS: GatedVerb[] = [
  {
    name: 'od project delete',
    args: ['project', 'delete', 'proj-1'],
    expected: { method: 'DELETE', url: '/api/projects/proj-1' },
    namesTarget: /project "proj-1"/,
  },
  {
    name: 'od files delete',
    args: ['files', 'delete', 'proj-1', 'index.html'],
    expected: { method: 'DELETE', url: '/api/projects/proj-1/files/index.html' },
    namesTarget: /file "index\.html" from project "proj-1"/,
  },
  {
    name: 'od brand delete',
    args: ['brand', 'delete', 'acme'],
    expected: { method: 'DELETE', url: '/api/brands/acme' },
    namesTarget: /brand "acme"/,
  },
  {
    name: 'od templates delete',
    args: ['templates', 'delete', 't-1'],
    expected: { method: 'DELETE', url: '/api/templates/t-1' },
    namesTarget: /template "t-1"/,
  },
  {
    name: 'od automation delete',
    args: ['automation', 'delete', 'r-1'],
    expected: { method: 'DELETE', url: '/api/routines/r-1' },
    namesTarget: /automation "r-1"/,
  },
];

describe('od delete confirmation gate', () => {
  let stub: StubServer;

  beforeAll(async () => {
    stub = await startStubServer();
  });

  afterAll(async () => {
    await stub.close();
  });

  beforeEach(() => {
    stub.requests.length = 0;
  });

  for (const verb of GATED_VERBS) {
    describe(verb.name, () => {
      it('refuses without --confirm, exits 2, and sends no request', async () => {
        const result = await runCli([...verb.args, '--daemon-url', stub.baseUrl]);

        expect(result.code).toBe(2);
        // The gate is only meaningful if it fires before the fetch — a
        // refusal that still issued the DELETE would be theatre.
        expect(stub.requests).toEqual([]);
        expect(result.stderr).toMatch(/refusing without --confirm/);
        // A useful refusal names the thing and the exact way through.
        expect(result.stderr).toMatch(verb.namesTarget);
        expect(result.stderr).toContain('--confirm');
      });

      it('emits a machine-readable refusal envelope under --json', async () => {
        const result = await runCli([...verb.args, '--daemon-url', stub.baseUrl, '--json']);

        expect(result.code).toBe(2);
        expect(stub.requests).toEqual([]);
        // stdout stays clean so a `--json` consumer piping stdout into jq
        // never parses half a refusal as a result.
        expect(result.stdout).toBe('');

        // Take the last JSON-looking line so an unrelated runtime warning on
        // stderr cannot turn a real assertion failure into a parse error.
        const envelopeLine = result.stderr
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.startsWith('{'))
          .pop();
        expect(envelopeLine, `no JSON envelope on stderr:\n${result.stderr}`).toBeTruthy();
        const envelope = JSON.parse(envelopeLine ?? '{}') as {
          error?: { code?: string; message?: string; data?: { flag?: string; command?: string } };
        };
        expect(envelope.error?.code).toBe('confirmation-required');
        expect(String(envelope.error?.message)).toMatch(verb.namesTarget);
        expect(envelope.error?.data?.flag).toBe('--confirm');
        expect(envelope.error?.data?.command).toContain('--confirm');
      });

      it('performs the delete when --confirm is supplied', async () => {
        const result = await runCli([...verb.args, '--daemon-url', stub.baseUrl, '--confirm']);

        expect(result.code).toBe(0);
        expect(stub.requests).toEqual([verb.expected]);
      });
    });
  }

  // The refusal must not swallow a genuinely malformed invocation: a missing
  // id is still a usage error, reported as one, before the gate is consulted.
  // (`templates` is the verb used here because it resolves positionals through
  // a flag-aware scanner; `project`/`files` still pick the first non-`-` token,
  // so a bare `--daemon-url <url>` is read as the id. That is a pre-existing
  // positional-parsing quirk, unrelated to this gate.)
  it('still reports a missing id as a usage error rather than a refusal', async () => {
    const result = await runCli(['templates', 'delete', '--daemon-url', stub.baseUrl]);

    expect(result.code).toBe(2);
    expect(stub.requests).toEqual([]);
    expect(result.stderr).toMatch(/Usage: od templates delete/);
    expect(result.stderr).not.toMatch(/refusing without --confirm/);
  });
});
