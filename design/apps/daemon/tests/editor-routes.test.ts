// Route-level coverage for GET /api/editor/detect and POST /api/editor/open.
//
// The module-level tests pin detection and argument construction; this file
// pins what the HTTP surface actually does with them — including the two
// promises that are only observable end to end:
//
//   - A folder opens as a WORKSPACE ROOT, and a lone file gets its containing
//     directory as that root, so "open this export in VS Code" is one action.
//   - When the chosen editor is missing, NOTHING is launched. Not a fallback
//     editor, not a best guess. The reply carries the download URL and the
//     probe trail instead.
//
// `spawn` is mocked at the node:child_process boundary, so the full route path
// runs and the exact spawn options are inspectable — that is where the
// "no shell, one argv element" claim is verified against the real launch code
// rather than against the builder in isolation.

import { EventEmitter } from 'node:events';
import type http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { tmpdir } from 'node:os';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerEditorRoutes } from '../src/routes/editor.js';
import type { RegisterEditorRoutesDeps } from '../src/routes/editor.js';

const spawnState = vi.hoisted(() => ({ fail: false, error: 'spawn code ENOENT' }));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: vi.fn(() => {
      const child = new EventEmitter() as EventEmitter & { unref: () => void };
      child.unref = () => {};
      setImmediate(() => {
        if (spawnState.fail) child.emit('error', new Error(spawnState.error));
        else child.emit('spawn');
      });
      return child;
    }),
  };
});

import { spawn } from 'node:child_process';

const spawnMock = spawn as unknown as ReturnType<typeof vi.fn>;

// `process.execPath` is the running node binary: an executable file that is
// guaranteed to exist on every host, so pinning OD_VSCODE_BIN at it makes
// "VS Code is installed" true and deterministic without mocking the
// filesystem or depending on a real editor being present on CI.
const FAKE_VSCODE = process.execPath;
const EXISTING_FILE = process.execPath;
const EXISTING_DIR = tmpdir();

let projectDir = path.join(tmpdir(), 'od-editor-project');
let appConfig: Record<string, unknown> = {};
let server: http.Server;
let baseUrl: string;
let originalVsCodeBin: string | undefined;

beforeAll(async () => {
  originalVsCodeBin = process.env.OD_VSCODE_BIN;
  process.env.OD_VSCODE_BIN = FAKE_VSCODE;

  const app = express();
  app.use(express.json());
  registerEditorRoutes(app, {
    db: {},
    http: {
      // Mirrors the compat shape of server.ts sendApiError.
      sendApiError: (
        res: Response,
        status: number,
        code: string,
        message: string,
        init: Record<string, unknown> = {},
      ) => res.status(status).json({ error: { code, message, ...init } }),
      requireLocalDaemonRequest: (_req: Request, _res: Response, next: NextFunction) => next(),
    },
    paths: { PROJECTS_DIR: tmpdir(), RUNTIME_DATA_DIR: tmpdir() },
    projectStore: {
      getProject: (_db: unknown, id: string) =>
        id === 'p1' ? { id, metadata: { baseDir: projectDir } } : null,
    },
    projectFiles: { resolveProjectDir: () => projectDir },
    appConfig: { readAppConfig: async () => appConfig },
  } as unknown as RegisterEditorRoutesDeps);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  if (originalVsCodeBin === undefined) delete process.env.OD_VSCODE_BIN;
  else process.env.OD_VSCODE_BIN = originalVsCodeBin;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  spawnState.fail = false;
  appConfig = {};
  projectDir = path.join(tmpdir(), 'od-editor-project');
  vi.clearAllMocks();
});

function openEditor(body: Record<string, unknown>) {
  return fetch(`${baseUrl}/api/editor/open`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

interface OpenBody {
  ok: true;
  editorId: string;
  label: string;
  command: string;
  args: string[];
  folder?: string;
  file?: string;
}

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: {
      kind?: string;
      editorId?: string;
      downloadUrl?: string;
      probedCommands?: string[];
      probedPaths?: string[];
    };
  };
}

describe('GET /api/editor/detect', () => {
  it('reports the pinned VS Code as available, with its download URL alongside', async () => {
    const resp = await fetch(`${baseUrl}/api/editor/detect`);
    expect(resp.status).toBe(200);

    const body = (await resp.json()) as {
      platform: string;
      vscodeAvailable: boolean;
      vscodeDownloadUrl: string;
      effectiveEditorId: string | null;
      editors: Array<{ id: string; available: boolean; command?: string }>;
    };

    expect(body.vscodeAvailable).toBe(true);
    expect(body.vscodeDownloadUrl).toBe('https://code.visualstudio.com/Download');
    expect(body.effectiveEditorId).toBe('vscode');
    expect(body.editors.find((editor) => editor.id === 'vscode')?.command).toBe(FAKE_VSCODE);
  });
});

describe('POST /api/editor/open opens a folder as a workspace root', () => {
  it('opens a project folder with the project dir as the sole argument', async () => {
    const resp = await openEditor({ projectId: 'p1' });

    expect(resp.status).toBe(200);
    const body = (await resp.json()) as OpenBody;
    expect(body.ok).toBe(true);
    expect(body.editorId).toBe('vscode');
    expect(body.command).toBe(FAKE_VSCODE);
    expect(body.args).toEqual([projectDir]);
    expect(body.folder).toBe(projectDir);
    expect(body.file).toBeUndefined();
  });

  it('opens a lone file with its containing directory as the workspace root', async () => {
    // This is the "anything the app can export is openable in one action"
    // case: the file the user just wrote, with a usable file tree around it.
    const exported = path.join(tmpdir(), 'od-exports', 'deck.pdf');
    const resp = await openEditor({ file: exported });

    const body = (await resp.json()) as OpenBody;
    expect(body.args).toEqual([path.dirname(exported), exported]);
    expect(body.folder).toBe(path.dirname(exported));
    expect(body.file).toBe(exported);
  });

  it('opens the file alone when the caller declines the workspace root', async () => {
    const exported = path.join(tmpdir(), 'od-exports', 'deck.pdf');
    const resp = await openEditor({ file: exported, openWorkspaceRoot: false });

    const body = (await resp.json()) as OpenBody;
    expect(body.args).toEqual([exported]);
    expect(body.folder).toBeUndefined();
  });

  it('pairs a project workspace root with a file inside it', async () => {
    const file = path.join(projectDir, 'index.html');
    const resp = await openEditor({ projectId: 'p1', file });

    const body = (await resp.json()) as OpenBody;
    expect(body.args).toEqual([projectDir, file]);
  });

  it('classifies a bare --path on disk rather than by suffix', async () => {
    const dirResp = await openEditor({ path: EXISTING_DIR });
    expect(((await dirResp.json()) as OpenBody).folder).toBe(EXISTING_DIR);

    const fileResp = await openEditor({ path: EXISTING_FILE });
    const fileBody = (await fileResp.json()) as OpenBody;
    expect(fileBody.file).toBe(EXISTING_FILE);
    expect(fileBody.folder).toBe(path.dirname(EXISTING_FILE));
  });

  it('404s a path that does not exist instead of launching an empty window', async () => {
    const resp = await openEditor({ path: path.join(tmpdir(), 'od-editor-definitely-absent') });

    expect(resp.status).toBe(404);
    expect(((await resp.json()) as ErrorBody).error.code).toBe('FILE_NOT_FOUND');
  });
});

describe('POST /api/editor/open never routes a path through a shell', () => {
  it('passes a metacharacter-laden project dir as one literal argv element', async () => {
    // The injection case. A project folder is user-controlled, and this exact
    // string would run `calc.exe` if the launch were ever built as a command
    // line for cmd.exe or sh.
    projectDir = path.join(tmpdir(), 'od-editor & calc.exe ; rm -rf ~ | nc evil 1');

    const resp = await openEditor({ projectId: 'p1' });
    expect(resp.status).toBe(200);

    const body = (await resp.json()) as OpenBody;
    expect(body.args).toEqual([projectDir]);

    const [, spawnArgs, spawnOpts] = spawnMock.mock.calls[0]!;
    expect((spawnOpts as { shell?: unknown }).shell).not.toBe(true);
    // One argv element, unsplit and unquoted — inert because nothing will
    // ever parse it.
    expect(spawnArgs as string[]).toContain(projectDir);
  });

  it('rejects a relative path rather than resolving it against the daemon cwd', async () => {
    const resp = await openEditor({ folder: 'relative/not/absolute' });

    expect(resp.status).toBe(400);
    expect(((await resp.json()) as ErrorBody).error.code).toBe('BAD_REQUEST');
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('rejects an option-shaped "path"', async () => {
    const resp = await openEditor({ file: '--wait' });

    expect(resp.status).toBe(400);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('rejects an unknown editor id before touching the filesystem', async () => {
    const resp = await openEditor({ projectId: 'p1', editorId: 'notepad-plus-plus' });

    expect(resp.status).toBe(400);
    expect(spawnMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/editor/open degrades honestly when no editor is found', () => {
  it('reports the chosen editor as missing and launches nothing else', async () => {
    // VS Code IS available in this suite, which is the point: an explicit
    // choice that is gone must not silently become a different editor.
    appConfig = { externalEditor: { id: 'custom', command: '/nonexistent/od-test-editor' } };

    const resp = await openEditor({ projectId: 'p1' });

    expect(resp.status).toBe(409);
    const body = (await resp.json()) as ErrorBody;
    expect(body.error.code).toBe('EDITOR_NOT_FOUND');
    expect(body.error.details?.kind).toBe('editor-not-found');
    // Named, not generic: "no editor was found" would be a lie on a machine
    // that has VS Code sitting right there.
    expect(body.error.details?.editorId).toBe('custom');
    expect(body.error.details?.probedPaths).toEqual(['/nonexistent/od-test-editor']);
    // The download link is what turns a dead end into a next step.
    expect(body.error.details?.downloadUrl).toBe('https://code.visualstudio.com/Download');
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('reports a named-but-absent editor with the trail of what was probed', async () => {
    const resp = await openEditor({ projectId: 'p1', editorId: 'custom' });

    expect(resp.status).toBe(409);
    const body = (await resp.json()) as ErrorBody;
    expect(body.error.code).toBe('EDITOR_NOT_FOUND');
    expect(body.error.details?.editorId).toBe('custom');
    expect(body.error.details?.downloadUrl).toBeTruthy();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('surfaces a refused launch instead of reporting success', async () => {
    spawnState.fail = true;

    const resp = await openEditor({ projectId: 'p1' });

    expect(resp.status).toBe(500);
    const body = (await resp.json()) as ErrorBody;
    expect(body.error.code).toBe('EDITOR_LAUNCH_FAILED');
    expect(body.error.message).toContain('spawn code ENOENT');
  });

  it('400s when the request names nothing to open', async () => {
    const resp = await openEditor({});

    expect(resp.status).toBe(400);
    expect(((await resp.json()) as ErrorBody).error.code).toBe('BAD_REQUEST');
  });

  it('404s an unknown project', async () => {
    const resp = await openEditor({ projectId: 'nope' });

    expect(resp.status).toBe(404);
    expect(((await resp.json()) as ErrorBody).error.code).toBe('PROJECT_NOT_FOUND');
  });
});
