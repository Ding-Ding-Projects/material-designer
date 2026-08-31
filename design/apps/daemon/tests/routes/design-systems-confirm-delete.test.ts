// `DELETE /api/design-systems/:id` — the confirmation boundary, and the line
// it is deliberately drawn on.
//
// One URL serves two different operations, and only one of them is gated:
//
//   * a non-`user:` id is a marketplace/installed **uninstall**, answered by
//     `routes/static-resource.ts`, which is registered ahead of this file. It
//     removes a checkout `POST /api/design-systems/install` fetches again from
//     its source, so it is reversible and stays ungated — gating it would spend
//     the gate's meaning on a one-click undo.
//   * a `user:` id is handed on (that handler calls `next()`), and lands on the
//     route under test: a user-authored, editable design system whose whole
//     directory is removed. `history/domains.ts` names `design-systems/` in its
//     list of deliberate absences, so no revision is written and nothing in the
//     product puts it back.
//
// These cases mount only `registerDesignSystemRoutes`, so every request here is
// one that reached the second handler. The uninstall's own behaviour belongs to
// the static-resource suite; what is asserted here is that the half which does
// reach this file cannot be deleted in one replayable request, and that the
// mint refuses to issue a token for anything this route would not delete.

import type http from 'node:http';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CONFIRM_DELETE_HEADER,
  type ConfirmDeleteResponse,
} from '@open-design/contracts';
import { registerDesignSystemRoutes } from '../../src/routes/design-systems.js';

let server: http.Server | null = null;

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = null;
});

function listen(app: express.Express): Promise<string> {
  return new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const address = server?.address() as { port: number };
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

/** The one editable system every case here operates on. */
const USER_ID = 'user:acme';

function mount() {
  const app = express();
  app.use(express.json());
  const deleteUserDesignSystem = vi.fn(async (_root: string, id: string) => id === USER_ID);

  registerDesignSystemRoutes(app, {
    db: { prepare: () => ({ run: () => undefined }) } as never,
    paths: { CRAFT_DIR: '', USER_DESIGN_SYSTEMS_DIR: '' } as never,
    projectFiles: {} as never,
    projectStore: {} as never,
    verifyWorkspaceRequestAuthority: async () => {
      throw new Error('unbound fixture must not verify workspace authority');
    },
    workspaceResources: {
      getWorkspaceResource: () => undefined,
      getWorkspaceResourceByResourceId: () => undefined,
    },
    designSystems: {
      buildUserDesignSystemArchive: async () => null,
      canMutateUserDesignSystem: async () => true,
      createUserDesignSystem: async () => ({}) as never,
      deleteUserDesignSystem,
      ensureUserDesignSystemWorkspaceProject: async () => null,
      // Only the editable system exists. Everything else — a preset, a
      // marketplace install, a typo — resolves to null, which is the mint
      // route's "this is not a system I would delete" answer.
      listAllDesignSystems: async () => [
        { id: USER_ID, title: 'Acme', source: 'user' } as never,
      ],
      listUserDesignSystemFiles: async (_root: string, id: string) =>
        id === USER_ID
          ? ([
              { path: 'DESIGN.md', name: 'DESIGN.md', kind: 'document' },
              { path: 'tokens.css', name: 'tokens.css', kind: 'stylesheet' },
              { path: 'assets', name: 'assets', kind: 'folder' },
            ] as never)
          : null,
      listUserDesignSystemRevisions: async () => null,
      prepareDesignTokenContractRebuild: async () => ({ decision: { available: false } }) as never,
      readAvailableDesignSystem: async () => null,
      readAvailableDesignSystemPackageInfo: async () => null,
      readAvailableDesignSystemStaticFile: async () => null,
      readDesignSystemWorkspaceTextFile: async () => null,
      readUserDesignSystemFile: async () => null,
      renderDesignSystemPreview: () => '',
      renderDesignSystemShowcase: () => '',
      syncUserDesignSystemAssetsFromWorkspace: async () => ({ ok: true, synced: [] }),
      unshareTeamDesignSystemIfShared: async () => false,
      updateUserDesignSystem: async () => null,
      updateUserDesignSystemRevisionStatus: async () => null,
    },
    generationJobs: {
      get: () => null,
      rebuildTokenContract: () => ({}) as never,
      revise: () => ({}) as never,
      start: () => ({}) as never,
    },
  });

  return { app, deleteUserDesignSystem };
}

interface ApiErrorBody {
  error?: {
    code?: string;
    details?: {
      reason?: string;
      confirmUrl?: string;
      resource?: { kind?: string; id?: string };
    };
  };
}

describe('DELETE /api/design-systems/:id requires a confirmation token', () => {
  async function mint(baseUrl: string, id: string) {
    return fetch(`${baseUrl}/api/design-systems/${encodeURIComponent(id)}/confirm-delete`, {
      method: 'POST',
    });
  }

  function del(baseUrl: string, id: string, token?: string) {
    return fetch(`${baseUrl}/api/design-systems/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      ...(token ? { headers: { [CONFIRM_DELETE_HEADER]: token } } : {}),
    });
  }

  // The caller neither interface gate can see: no web slider, no CLI flag,
  // just a request.
  it('refuses a bare DELETE with 428 and deletes nothing', async () => {
    const { app, deleteUserDesignSystem } = mount();
    const baseUrl = await listen(app);

    const res = await del(baseUrl, USER_ID);

    expect(res.status).toBe(428);
    const body = (await res.json()) as ApiErrorBody;
    expect(body.error?.code).toBe('CONFIRMATION_REQUIRED');
    expect(body.error?.details?.reason).toBe('missing');
    expect(body.error?.details?.resource).toEqual({ kind: 'design-system', id: USER_ID });
    // The refusal has to say how to proceed, or a machine caller is stuck.
    expect(body.error?.details?.confirmUrl).toBe('/api/design-systems/user%3Aacme/confirm-delete');
    // Fail closed means the directory is still there, not merely that the
    // status was unhappy.
    expect(deleteUserDesignSystem).not.toHaveBeenCalled();
  });

  it('deletes with a valid token', async () => {
    const { app, deleteUserDesignSystem } = mount();
    const baseUrl = await listen(app);

    const minted = (await (await mint(baseUrl, USER_ID)).json()) as ConfirmDeleteResponse;
    const res = await del(baseUrl, USER_ID, minted.token);

    expect(res.status).toBe(204);
    expect(deleteUserDesignSystem).toHaveBeenCalledTimes(1);
  });

  it('spends the token once', async () => {
    const { app, deleteUserDesignSystem } = mount();
    const baseUrl = await listen(app);

    const minted = (await (await mint(baseUrl, USER_ID)).json()) as ConfirmDeleteResponse;
    expect((await del(baseUrl, USER_ID, minted.token)).status).toBe(204);

    const second = await del(baseUrl, USER_ID, minted.token);
    expect(second.status).toBe(428);
    expect(((await second.json()) as ApiErrorBody).error?.details?.reason).toBe('unknown');
    expect(deleteUserDesignSystem).toHaveBeenCalledTimes(1);
  });

  it('names what goes, computed from the directory the delete removes', async () => {
    const { app } = mount();
    const baseUrl = await listen(app);

    const minted = (await (await mint(baseUrl, USER_ID)).json()) as ConfirmDeleteResponse;

    expect(minted.summary).toMatchObject({
      kind: 'design-system',
      id: USER_ID,
      // The system's own title, not its id — this is the string the user has
      // to be able to check the slider against.
      label: 'Acme',
      reversible: false,
    });
    // Two files and one folder listed; the folder is not a file.
    expect(minted.summary.items.join(' ')).toContain('2 files');
  });

  // The guard that keeps this gate off the uninstall path. A marketplace id
  // never reaches this handler in production — `routes/static-resource.ts`
  // answers it first — but if one ever did, the mint refusing to issue for it
  // is what stops a 428 from silently becoming the uninstall's new behaviour.
  it('refuses to mint for anything that is not an editable user: system', async () => {
    const { app } = mount();
    const baseUrl = await listen(app);

    for (const id of ['bento', 'user:nope']) {
      const res = await mint(baseUrl, id);
      expect(res.status, `expected no token for ${id}`).toBe(404);
    }
  });
});
