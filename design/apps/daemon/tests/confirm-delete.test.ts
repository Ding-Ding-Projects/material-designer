// The destructive-delete confirmation boundary, at the daemon's own HTTP edge.
//
// `docs/standards/super-confirmation.md` puts the requirement plainly: "This is
// an authorization boundary, and boundaries are enforced in the handler, never
// in the interface." Until now it was enforced twice in two interfaces — the
// web app's two-key `DestructiveGate` and the CLI's `--confirm` flag — and
// therefore not at all for anything that was neither. `curl -X DELETE
// /api/projects/p1` met neither gate and succeeded.
//
// So the assertions here are deliberately made from *outside* both interfaces:
// a bare Express app with the real project route registrar and a real sqlite
// database, driven by plain `fetch`. That is precisely the caller the standard
// says must be refused, and the only way to prove the refusal is not another
// property of a surface.
//
// Two layers, because they fail differently:
//   * the route tests below prove the wiring — that the middleware is actually
//     mounted on the DELETE, that the mint route exists, and that the refusal
//     is machine-readable;
//   * the store tests prove the token semantics — single use, resource binding
//     and expiry — with an injected clock, so expiry is asserted on a real
//     comparison rather than on a sleep.

import express from 'express';
import type { Response } from 'express';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CONFIRM_DELETE_HEADER,
  CONFIRM_DELETE_TTL_MS,
  type ConfirmDeleteResponse,
} from '@open-design/contracts';

import {
  closeDatabase,
  deleteConversation,
  deleteProject as dbDeleteProject,
  getConversation,
  getProject,
  insertConversation,
  insertProject,
  listConversations,
  listMessages,
  openDatabase,
  updateConversation,
  updateProject,
  upsertMessage,
} from '../src/db.js';
import { createChatRunService } from '../src/runtimes/runs.js';
import { createConfirmDeleteStore } from '../src/http/confirm-delete.js';
import {
  registerProjectRoutes,
  type RegisterProjectRoutesDeps,
} from '../src/routes/project/index.js';

type Db = ReturnType<typeof openDatabase>;

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: {
      kind?: string;
      reason?: string;
      confirmUrl?: string;
      header?: string;
      resource?: { kind?: string; id?: string };
    };
  };
}

// Mounted the same way `delete-cancels-active-runs.test.ts` mounts it, so the
// route under test is the production registrar rather than a re-implementation.
/**
 * The folder tree the folders routes read, mutable per test.
 *
 * `ctx.projectFiles` is the seam the production registrar reads its filesystem
 * helpers through, so stubbing it here exercises the real route — the mint's
 * existence check, the token binding, and the middleware — without needing a
 * real project directory on disk.
 */
interface ProjectTree {
  folders: Array<{ name: string; path: string }>;
  files: Array<{ name: string; path: string }>;
}

async function mountProjectApp(db: Db, tempDir: string) {
  const app = express();
  app.use(express.json());
  const noop = vi.fn();
  const tree: ProjectTree = { folders: [], files: [] };
  const deleteProjectFolder = vi.fn(async () => {});
  const runs = createChatRunService({
    createSseResponse: () => ({ send: vi.fn(() => true), end: vi.fn(), cleanup: vi.fn() }),
    createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
    shutdownGraceMs: 10,
    ttlMs: 60_000,
  });
  const removeProjectDir = vi.fn(async () => {});

  registerProjectRoutes(app, {
    db,
    design: { runs },
    http: {
      sendApiError: (res: Response, status: number, code: string, message: string) =>
        res.status(status).json({ error: { code, message } }),
      createSseResponse: () => ({ send: vi.fn(() => true), end: vi.fn(), cleanup: vi.fn() }),
    },
    paths: {
      BRANDS_DIR: tempDir,
      DESIGN_SYSTEMS_DIR: tempDir,
      PROJECTS_DIR: tempDir,
      RUNTIME_DATA_DIR: tempDir,
      RUNTIME_DATA_DIR_CANONICAL: tempDir,
      SKILLS_DIR: tempDir,
      USER_DESIGN_SYSTEMS_DIR: tempDir,
    },
    projectStore: {
      insertProject,
      getProject,
      updateProject,
      dbDeleteProject,
      removeProjectDir,
      validateLinkedDirs: vi.fn(() => ({ dirs: [], error: null })),
    },
    projectFiles: {
      ensureProject: noop,
      listFiles: vi.fn(async () => tree.files),
      listProjectFolders: vi.fn(async () => tree.folders),
      createProjectFolder: noop,
      deleteProjectFolder,
      listTabs: vi.fn(() => ({ tabs: [] })),
      setTabs: noop,
      readProjectFile: noop,
      writeProjectFile: noop,
      resolveProjectDir: (_projectsRoot: string, projectId: string) => path.join(tempDir, projectId),
    },
    conversations: {
      insertConversation,
      getConversation,
      listConversations,
      updateConversation,
      deleteConversation,
      listMessages,
      upsertMessage,
    },
    templates: {
      getTemplate: noop,
      listTemplates: vi.fn(() => []),
      deleteTemplate: noop,
      insertTemplate: noop,
      findTemplateByNameAndProject: noop,
      updateTemplate: noop,
    },
    status: {
      listLatestProjectRunStatuses: vi.fn(() => []),
      listProjectsAwaitingInput: vi.fn(() => new Set()),
      normalizeProjectDisplayStatus: noop,
      composeProjectDisplayStatus: noop,
      listProjects: vi.fn(() => []),
    },
    events: { subscribeFileEvents: noop, activeProjectEventSinks: new Map() },
    ids: { randomId: () => 'rid-' + Math.random().toString(36).slice(2) },
    telemetry: {},
    appConfig: { readAppConfig: async () => ({}), writeAppConfig: noop },
    agents: { getAgentDef: () => null },
    validation: {
      validateProjectDesignSystemId: noop,
      validateProjectSkillId: noop,
    },
  } as unknown as RegisterProjectRoutesDeps);

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    base,
    removeProjectDir,
    deleteProjectFolder,
    tree,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe('DELETE /api/projects/:id requires a confirmation token', () => {
  let tempDir: string;
  let db: Db;
  let app: Awaited<ReturnType<typeof mountProjectApp>>;

  async function mint(id: string): Promise<ConfirmDeleteResponse> {
    const res = await fetch(`${app.base}/api/projects/${id}/confirm-delete`, { method: 'POST' });
    expect(res.status).toBe(200);
    return (await res.json()) as ConfirmDeleteResponse;
  }

  function del(id: string, token?: string) {
    return fetch(`${app.base}/api/projects/${id}`, {
      method: 'DELETE',
      ...(token ? { headers: { [CONFIRM_DELETE_HEADER]: token } } : {}),
    });
  }

  beforeEach(async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-confirm-delete-'));
    db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    insertProject(db, { id: 'p1', name: 'First', createdAt: now, updatedAt: now });
    insertProject(db, { id: 'p2', name: 'Second', createdAt: now, updatedAt: now });
    app = await mountProjectApp(db, tempDir);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await app.close();
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  // The headline case: the caller neither interface gate can see.
  it('refuses a bare DELETE with 428 and leaves the project intact', async () => {
    const res = await del('p1');

    expect(res.status).toBe(428);
    const body = (await res.json()) as ApiErrorBody;
    expect(body.error?.code).toBe('CONFIRMATION_REQUIRED');
    expect(body.error?.details?.reason).toBe('missing');
    expect(body.error?.details?.resource).toEqual({ kind: 'project', id: 'p1' });
    // The refusal has to say how to proceed, or a machine caller is stuck.
    expect(body.error?.details?.confirmUrl).toBe('/api/projects/p1/confirm-delete');
    expect(body.error?.details?.header).toBe(CONFIRM_DELETE_HEADER);

    // Fail closed means the row is still there, not merely that the status was
    // unhappy — a 4xx on a delete that ran anyway is the worst of both.
    expect(getProject(db, 'p1')).not.toBeNull();
    expect(app.removeProjectDir).not.toHaveBeenCalled();
  });

  it('refuses a token that was never issued', async () => {
    const res = await del('p1', 'not-a-real-token');

    expect(res.status).toBe(428);
    const body = (await res.json()) as ApiErrorBody;
    expect(body.error?.details?.reason).toBe('unknown');
    expect(getProject(db, 'p1')).not.toBeNull();
  });

  it('refuses a token issued for a different project, and leaves that token usable', async () => {
    const forP1 = await mint('p1');

    const wrong = await del('p2', forP1.token);
    expect(wrong.status).toBe(428);
    expect(((await wrong.json()) as ApiErrorBody).error?.details?.reason).toBe('resource-mismatch');
    expect(getProject(db, 'p2')).not.toBeNull();

    // A token sent at the wrong URL must not be burned: the caller who
    // legitimately holds it did nothing wrong.
    const right = await del('p1', forP1.token);
    expect(right.status).toBe(200);
    expect(getProject(db, 'p1')).toBeNull();
  });

  it('refuses a token that has already been spent', async () => {
    const confirmation = await mint('p1');

    const first = await del('p1', confirmation.token);
    expect(first.status).toBe(200);

    // Re-inserted so the second attempt is refused by the gate rather than by
    // the row simply being absent.
    const now = Date.now();
    insertProject(db, { id: 'p1', name: 'First again', createdAt: now, updatedAt: now });

    const second = await del('p1', confirmation.token);
    expect(second.status).toBe(428);
    expect(((await second.json()) as ApiErrorBody).error?.details?.reason).toBe('unknown');
    expect(getProject(db, 'p1')).not.toBeNull();
  });

  it('refuses a token that has expired', async () => {
    // Only `Date` is faked. Faking the timer wheel as well would stall the http
    // server and undici, and the test would hang rather than fail.
    vi.useFakeTimers({ toFake: ['Date'] });
    const confirmation = await mint('p1');
    vi.setSystemTime(Date.now() + CONFIRM_DELETE_TTL_MS + 1);

    const res = await del('p1', confirmation.token);
    expect(res.status).toBe(428);
    expect(((await res.json()) as ApiErrorBody).error?.details?.reason).toBe('expired');
    expect(getProject(db, 'p1')).not.toBeNull();
  });

  it('deletes with a valid token', async () => {
    const confirmation = await mint('p1');

    const res = await del('p1', confirmation.token);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(getProject(db, 'p1')).toBeNull();
    expect(app.removeProjectDir).toHaveBeenCalled();
  });

  it('names the real blast radius when it mints, and refuses to mint for a phantom id', async () => {
    const confirmation = await mint('p1');
    expect(confirmation.summary).toMatchObject({
      kind: 'project',
      id: 'p1',
      label: 'First',
      reversible: false,
    });
    expect(confirmation.summary.items.length).toBeGreaterThan(0);
    expect(confirmation.expiresInMs).toBe(CONFIRM_DELETE_TTL_MS);

    const missing = await fetch(`${app.base}/api/projects/nope/confirm-delete`, { method: 'POST' });
    expect(missing.status).toBe(404);
  });
});

// The folder route is the one gated subject that is not fully in the URL: the
// folder travels in the body, so a token bound to the project alone would let a
// grant for `drafts/` remove `final/`. That is the property this block exists
// for, alongside the wiring the block above proves for projects.
//
// It is gated where `DELETE /api/projects/:id/files/:name` deliberately is not,
// and the difference is not the verb. The file route tombstones the file's
// version manifest, so every revision survives and the delete is undoable; this
// route is an `rm -rf` that writes no revision at all.
describe('DELETE /api/projects/:id/folders requires a confirmation token', () => {
  let tempDir: string;
  let db: Db;
  let app: Awaited<ReturnType<typeof mountProjectApp>>;

  function mint(projectId: string, folderPath: string) {
    return fetch(`${app.base}/api/projects/${projectId}/folders/confirm-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: folderPath }),
    });
  }

  function del(projectId: string, folderPath: string, token?: string) {
    return fetch(`${app.base}/api/projects/${projectId}/folders`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { [CONFIRM_DELETE_HEADER]: token } : {}),
      },
      body: JSON.stringify({ path: folderPath }),
    });
  }

  beforeEach(async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-confirm-folders-'));
    db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    insertProject(db, { id: 'p1', name: 'First', createdAt: now, updatedAt: now });
    app = await mountProjectApp(db, tempDir);
    app.tree.folders = [
      { name: 'drafts', path: 'drafts' },
      { name: 'drafts/old', path: 'drafts/old' },
      { name: 'final', path: 'final' },
    ];
    app.tree.files = [
      { name: 'drafts/a.html', path: 'drafts/a.html' },
      { name: 'drafts/old/b.png', path: 'drafts/old/b.png' },
      { name: 'final/c.html', path: 'final/c.html' },
    ];
  });

  afterEach(async () => {
    await app.close();
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('refuses a bare DELETE with 428 and removes nothing', async () => {
    const res = await del('p1', 'drafts');

    expect(res.status).toBe(428);
    const body = (await res.json()) as ApiErrorBody;
    expect(body.error?.code).toBe('CONFIRMATION_REQUIRED');
    expect(body.error?.details?.reason).toBe('missing');
    expect(body.error?.details?.resource?.kind).toBe('project-folder');
    expect(body.error?.details?.confirmUrl).toBe('/api/projects/p1/folders/confirm-delete');
    expect(app.deleteProjectFolder).not.toHaveBeenCalled();
  });

  it('deletes with a token minted for that exact folder', async () => {
    const minted = (await (await mint('p1', 'drafts')).json()) as ConfirmDeleteResponse;

    const res = await del('p1', 'drafts', minted.token);
    expect(res.status).toBe(200);
    expect(app.deleteProjectFolder).toHaveBeenCalledTimes(1);
  });

  // The headline property of binding to the pair rather than to the project.
  it('refuses a token minted for a sibling folder, and leaves that token usable', async () => {
    const forDrafts = (await (await mint('p1', 'drafts')).json()) as ConfirmDeleteResponse;

    const wrong = await del('p1', 'final', forDrafts.token);
    expect(wrong.status).toBe(428);
    expect(((await wrong.json()) as ApiErrorBody).error?.details?.reason).toBe('resource-mismatch');
    expect(app.deleteProjectFolder).not.toHaveBeenCalled();

    // A token sent at the wrong folder must not be burned: the caller who
    // legitimately holds it did nothing wrong.
    const right = await del('p1', 'drafts', forDrafts.token);
    expect(right.status).toBe(200);
  });

  // Mint and consume each read the body on their own leg. If a trailing slash
  // produced a different binding, the correct caller would be refused.
  it('reads one folder the same way however the two legs spelled it', async () => {
    const minted = (await (await mint('p1', 'drafts/')).json()) as ConfirmDeleteResponse;

    const res = await del('p1', 'drafts', minted.token);
    expect(res.status).toBe(200);
  });

  it('names the real blast radius, counted from the tree the delete will remove', async () => {
    const minted = (await (await mint('p1', 'drafts')).json()) as ConfirmDeleteResponse;

    expect(minted.summary).toMatchObject({
      kind: 'project-folder',
      label: 'drafts',
      reversible: false,
    });
    // Two files under `drafts/`, in one nested folder. `final/c.html` is a
    // sibling and must not be counted.
    expect(minted.summary.items.join(' ')).toContain('2 files');
    expect(minted.summary.items.join(' ')).toContain('1 nested folder');
  });

  it('refuses to mint for a folder that is not in the project', async () => {
    const res = await mint('p1', 'nope');
    expect(res.status).toBe(404);
    expect(((await res.json()) as ApiErrorBody).error?.code).toBe('FOLDER_NOT_FOUND');
  });

  it('spends a folder token once', async () => {
    const minted = (await (await mint('p1', 'drafts')).json()) as ConfirmDeleteResponse;

    expect((await del('p1', 'drafts', minted.token)).status).toBe(200);
    const second = await del('p1', 'drafts', minted.token);
    expect(second.status).toBe(428);
    expect(((await second.json()) as ApiErrorBody).error?.details?.reason).toBe('unknown');
    expect(app.deleteProjectFolder).toHaveBeenCalledTimes(1);
  });
});

describe('confirmation token store', () => {
  const T0 = 1_000_000;

  it('accepts a token once, for the resource it was bound to', () => {
    const store = createConfirmDeleteStore();
    const { token } = store.issue('project', 'p1', T0);

    expect(store.consume('project', 'p1', token, T0 + 1)).toEqual({ ok: true });
    expect(store.consume('project', 'p1', token, T0 + 2)).toEqual({ ok: false, reason: 'unknown' });
    expect(store.size()).toBe(0);
  });

  it('distinguishes a missing header from an unrecognized token', () => {
    const store = createConfirmDeleteStore();

    expect(store.consume('project', 'p1', undefined, T0)).toEqual({ ok: false, reason: 'missing' });
    expect(store.consume('project', 'p1', '', T0)).toEqual({ ok: false, reason: 'missing' });
    expect(store.consume('project', 'p1', 'x', T0)).toEqual({ ok: false, reason: 'unknown' });
  });

  it('binds to the resource kind as well as the id', () => {
    const store = createConfirmDeleteStore();
    const { token } = store.issue('project', 'shared-id', T0);

    // Same id, different family — the ids are independent namespaces, so a
    // token minted for one must not authorize a delete in the other.
    expect(store.consume('brand', 'shared-id', token, T0)).toEqual({
      ok: false,
      reason: 'resource-mismatch',
    });
    expect(store.consume('project', 'shared-id', token, T0)).toEqual({ ok: true });
  });

  it('expires exactly at the TTL boundary and drops the entry', () => {
    const store = createConfirmDeleteStore();
    const { token, expiresAt } = store.issue('library-asset', 'a1', T0);
    expect(expiresAt).toBe(T0 + CONFIRM_DELETE_TTL_MS);

    // At the boundary it is already gone: `expiresAt` is the first instant the
    // token is no longer valid, not the last instant it is.
    expect(store.consume('library-asset', 'a1', token, expiresAt)).toEqual({
      ok: false,
      reason: 'expired',
    });
    expect(store.size()).toBe(0);
  });

  it('sweeps expired tokens rather than growing without bound', () => {
    const store = createConfirmDeleteStore();
    for (let i = 0; i < 10; i += 1) store.issue('project', `p${i}`, T0);
    expect(store.size()).toBe(10);

    store.issue('project', 'later', T0 + CONFIRM_DELETE_TTL_MS + 1);
    expect(store.size()).toBe(1);
  });
});
