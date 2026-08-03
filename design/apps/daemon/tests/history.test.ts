import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  closeDatabase,
  deleteRoutine,
  getRoutine,
  insertRoutine,
  insertScheduledRoutineRun,
  listRoutineRuns,
  openDatabase,
  updateRoutine,
} from '../src/db.js';
import {
  type HistoryDomain,
  defaultHistoryDomains,
  describeSourceChange,
  domainIdForRepoPath,
  repoPathForSource,
} from '../src/history/domains.js';
import { createSqliteTableDomain, type SqliteLike } from '../src/history/sqlite-domain.js';
import { HistoryService } from '../src/history/service.js';
import { HistoryStore, historyRepoDir } from '../src/history/store.js';
import { requireLocalDaemonRequest } from '../src/http/local-daemon-request.js';
import { registerHistoryRoutes } from '../src/routes/history.js';

// The store shells out to a real `git`. Everything here is skipped rather than
// failed when git is missing, matching how the daemon itself degrades: no git
// means no history, and that is reported honestly rather than crashing.
const gitAvailable = (() => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const CONNECTORS: HistoryDomain = {
  id: 'connectors',
  label: 'Connector accounts',
  noun: 'connector account',
  nounPlural: 'connector accounts',
  sensitive: true,
  sources: [
    {
      kind: 'file',
      dataPath: 'connectors/credentials.json',
      recordKeys: 'object',
      labelField: 'accountLabel',
    },
  ],
};

const VAULT: HistoryDomain = {
  id: 'vault',
  label: 'Encrypted vault',
  noun: 'vault blob',
  nounPlural: 'vault blobs',
  sources: [{ kind: 'file', dataPath: 'vault/secret.bin' }],
};

/** Bytes that are neither valid UTF-8 nor free of NULs — i.e. ciphertext. */
const CIPHERTEXT_A = Buffer.from([0x00, 0xff, 0xfe, 0x10, 0x80, 0x00, 0x41]);
const CIPHERTEXT_B = Buffer.from([0x00, 0x01, 0xc3, 0x28, 0xff, 0x7f]);

describe.skipIf(!gitAvailable)('local Git-backed version history', () => {
  let dataRoot: string;

  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), 'od-history-'));
  });

  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  async function writeCredentials(value: unknown): Promise<void> {
    const file = path.join(dataRoot, 'connectors', 'credentials.json');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }

  async function readCredentials(): Promise<Record<string, unknown> | null> {
    try {
      const raw = await readFile(path.join(dataRoot, 'connectors', 'credentials.json'), 'utf8');
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  function newStore(domains: HistoryDomain[] = [CONNECTORS]): HistoryStore {
    return new HistoryStore({ dataRoot, domains });
  }

  it('keeps its repository under the resolved data root, never in a project folder', async () => {
    const store = newStore();
    await store.ensureRepo();
    expect(store.getRepoDir()).toBe(historyRepoDir(dataRoot));
    expect(store.getRepoDir().startsWith(path.join(dataRoot, 'history'))).toBe(true);
    // Managed projects live under <dataRoot>/projects; history must not be
    // inside one of them.
    expect(store.getRepoDir().includes(`${path.sep}projects${path.sep}`)).toBe(false);
  });

  it('records a revision when a record changes and nothing when it does not', async () => {
    const store = newStore();
    await writeCredentials({ github: { accountLabel: 'GitHub' } });

    const first = await store.capture();
    expect(first.committed).toBe(true);

    const second = await store.capture();
    expect(second.committed).toBe(false);
    expect(second.revision).toBeNull();

    const revisions = await store.listRevisions();
    // The initial "started history" revision plus exactly one real event.
    expect(revisions).toHaveLength(2);
    expect(revisions[0]?.kind).toBe('mutation');
    expect(revisions[1]?.kind).toBe('initial');
  });

  it('labels what changed rather than that something changed', async () => {
    const store = newStore();
    await writeCredentials({
      github: { accountLabel: 'GitHub' },
      slack: { accountLabel: 'Slack' },
    });
    await store.capture();

    await writeCredentials({ slack: { accountLabel: 'Slack' } });
    const removal = await store.capture();

    expect(removal.committed).toBe(true);
    expect(removal.revision?.label).toBe('Deleted the connector account GitHub');
    expect(removal.revision?.domainIds).toEqual(['connectors']);
  });

  it('restores, then undoes the restore, then undoes that undo', async () => {
    const store = newStore();

    await writeCredentials({
      github: { accountLabel: 'GitHub' },
      slack: { accountLabel: 'Slack' },
    });
    const both = await store.capture();
    expect(both.revision).not.toBeNull();

    await writeCredentials({ slack: { accountLabel: 'Slack' } });
    const deleted = await store.capture();
    expect(deleted.revision).not.toBeNull();
    expect(await readCredentials()).toEqual({ slack: { accountLabel: 'Slack' } });

    // Undo the deletion.
    const undo = await store.restoreRevision(both.revision!.id);
    expect(undo.unchanged).toBe(false);
    expect(undo.recorded).not.toBeNull();
    expect(undo.recorded?.kind).toBe('restore');
    expect(undo.recorded?.restoredFromId).toBe(both.revision!.id);
    expect(await readCredentials()).toEqual({
      github: { accountLabel: 'GitHub' },
      slack: { accountLabel: 'Slack' },
    });

    // Undo the undo: the state the restore replaced was never discarded, so
    // it is still a revision anyone can go back to.
    const redo = await store.restoreRevision(deleted.revision!.id);
    expect(redo.unchanged).toBe(false);
    expect(await readCredentials()).toEqual({ slack: { accountLabel: 'Slack' } });

    // And undo that in turn, by restoring the restore itself.
    const undoAgain = await store.restoreRevision(undo.recorded!.id);
    expect(undoAgain.unchanged).toBe(false);
    expect(await readCredentials()).toEqual({
      github: { accountLabel: 'GitHub' },
      slack: { accountLabel: 'Slack' },
    });

    // Nothing was rewound along the way: every revision is still in the log,
    // in order, and each restore added one rather than replacing one.
    const revisions = await store.listRevisions();
    const ids = revisions.map((revision) => revision.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [
      both.revision!.id,
      deleted.revision!.id,
      undo.recorded!.id,
      redo.recorded!.id,
      undoAgain.recorded!.id,
    ]) {
      expect(ids).toContain(id);
    }
    // initial + 2 mutations + 3 restores
    expect(revisions).toHaveLength(6);
    expect(revisions.filter((revision) => revision.kind === 'restore')).toHaveLength(3);
  });

  it('records nothing when a restore would not change anything', async () => {
    const store = newStore();
    await writeCredentials({ github: { accountLabel: 'GitHub' } });
    const created = await store.capture();

    const result = await store.restoreRevision(created.revision!.id);
    expect(result.unchanged).toBe(true);
    expect(result.recorded).toBeNull();
    expect(await store.listRevisions()).toHaveLength(2);
  });

  it('round-trips ciphertext byte for byte', async () => {
    const store = newStore([VAULT]);
    const blob = path.join(dataRoot, 'vault', 'secret.bin');
    await mkdir(path.dirname(blob), { recursive: true });

    await writeFile(blob, CIPHERTEXT_A);
    const first = await store.capture();
    expect(first.committed).toBe(true);

    await writeFile(blob, CIPHERTEXT_B);
    await store.capture();
    expect(await readFile(blob)).toEqual(CIPHERTEXT_B);

    await store.restoreRevision(first.revision!.id);
    const restored = await readFile(blob);
    expect(restored.equals(CIPHERTEXT_A)).toBe(true);

    // The stored copy is the same bytes too: nothing is decoded, re-encoded,
    // or line-ending-normalized on the way through git.
    const stored = await store.readEntry(first.revision!.id, 'records/vault/vault/secret.bin');
    expect(stored).not.toBeNull();
    expect(stored!.equals(CIPHERTEXT_A)).toBe(true);
  });

  it('restores a record that did not exist yet by removing it', async () => {
    const store = newStore();
    await writeCredentials({ github: { accountLabel: 'GitHub' } });
    const before = await store.capture();

    await writeCredentials({
      github: { accountLabel: 'GitHub' },
      slack: { accountLabel: 'Slack' },
    });
    await store.capture();

    await store.restoreRevision(before.revision!.id);
    expect(await readCredentials()).toEqual({ github: { accountLabel: 'GitHub' } });
  });

  it('refuses a source that points outside the data root', async () => {
    const escaping: HistoryDomain = {
      id: 'escape',
      label: 'Escape',
      noun: 'thing',
      nounPlural: 'things',
      sources: [{ kind: 'file', dataPath: '../outside.json' }],
    };
    const store = newStore([escaping]);
    await expect(store.capture()).rejects.toThrow(/escapes the data root/u);
  });

  it('refuses a source that points inside the history store itself', async () => {
    const recursive: HistoryDomain = {
      id: 'recursive',
      label: 'Recursive',
      noun: 'thing',
      nounPlural: 'things',
      sources: [{ kind: 'dir', dataPath: 'history' }],
    };
    const store = newStore([recursive]);
    await expect(store.capture()).rejects.toThrow(/inside the history store/u);
  });

  it('reads an entry path only inside the records tree', async () => {
    const store = newStore();
    await writeCredentials({ github: { accountLabel: 'GitHub' } });
    const created = await store.capture();
    await expect(
      store.readEntry(created.revision!.id, '../../../etc/passwd'),
    ).rejects.toThrow(/out of scope/u);
  });

  it('restores records that live behind a read/write payload, not a file', async () => {
    let rows: Array<{ id: string; name: string }> = [
      { id: 'a', name: 'Nightly digest' },
      { id: 'b', name: 'Weekly report' },
    ];
    const automations: HistoryDomain = {
      id: 'routines',
      label: 'Scheduled automations',
      noun: 'automation',
      nounPlural: 'automations',
      sources: [
        {
          kind: 'payload',
          fileName: 'routines.json',
          read: () => rows,
          write: (value) => {
            rows = value as Array<{ id: string; name: string }>;
          },
          recordKeys: 'array',
          idField: 'id',
          labelField: 'name',
        },
      ],
    };
    const store = newStore([automations]);
    const created = await store.capture();
    expect(created.committed).toBe(true);

    rows = [{ id: 'b', name: 'Weekly report' }];
    const removed = await store.capture();
    expect(removed.revision?.label).toBe('Deleted the automation Nightly digest');

    await store.restoreRevision(created.revision!.id);
    expect(rows).toEqual([
      { id: 'a', name: 'Nightly digest' },
      { id: 'b', name: 'Weekly report' },
    ]);
  });

  it('records the mixed state a half-failed restore left behind', async () => {
    let payload: unknown = { generation: 'first' };
    const brittle: HistoryDomain = {
      id: 'brittle',
      label: 'Brittle',
      noun: 'row',
      nounPlural: 'rows',
      sources: [
        {
          kind: 'payload',
          fileName: 'rows.json',
          read: () => payload,
          write: () => {
            throw new Error('the table lost a column');
          },
        },
      ],
    };
    // Declaration order matters: connectors is rewritten on disk before the
    // payload domain throws, which is exactly the mixed state at issue.
    const store = newStore([CONNECTORS, brittle]);
    await writeCredentials({ github: { accountLabel: 'GitHub' } });
    const first = await store.capture();

    await writeCredentials({ slack: { accountLabel: 'Slack' } });
    payload = { generation: 'second' };
    await store.capture();

    await expect(store.restoreRevision(first.revision!.id)).rejects.toThrow(/brittle/u);

    // The half that landed is on disk …
    expect(await readCredentials()).toEqual({ github: { accountLabel: 'GitHub' } });
    // … and, crucially, it is also in the log, named as a partial restore, so
    // the user can restore back out of it.
    const revisions = await store.listRevisions();
    expect(revisions[0]?.kind).toBe('restore');
    expect(
      revisions[0]?.details.some((line) => line.includes('Not restored: brittle')),
    ).toBe(true);
  });

  it('leaves a nested repository alone when restoring a directory domain', async () => {
    const memory: HistoryDomain = {
      id: 'memory',
      label: 'Memory',
      noun: 'memory file',
      nounPlural: 'memory files',
      sources: [{ kind: 'dir', dataPath: 'memory' }],
    };
    const store = newStore([memory]);
    const liveDir = path.join(dataRoot, 'memory');
    const nestedGit = path.join(liveDir, 'checkout', '.git');
    await mkdir(nestedGit, { recursive: true });
    await writeFile(path.join(nestedGit, 'HEAD'), 'ref: refs/heads/main\n', 'utf8');
    await writeFile(path.join(liveDir, 'notes.md'), 'first\n', 'utf8');
    const first = await store.capture();

    await writeFile(path.join(liveDir, 'notes.md'), 'second\n', 'utf8');
    await writeFile(path.join(liveDir, 'later.md'), 'added\n', 'utf8');
    await store.capture();

    await store.restoreRevision(first.revision!.id);

    expect(await readFile(path.join(liveDir, 'notes.md'), 'utf8')).toBe('first\n');
    // A file the target revision did not contain really is removed …
    await expect(readFile(path.join(liveDir, 'later.md'), 'utf8')).rejects.toThrow();
    // … but capture deliberately never mirrors a nested `.git`, so restore must
    // not read its absence from the snapshot as "the user deleted it".
    expect(await readFile(path.join(nestedGit, 'HEAD'), 'utf8')).toBe('ref: refs/heads/main\n');
  });
});

describe.skipIf(!gitAvailable)('history service', () => {
  let dataRoot: string;
  let service: HistoryService;

  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), 'od-history-svc-'));
    service = new HistoryService({
      dataRoot,
      domains: [CONNECTORS],
      // The watcher is the daemon's own trigger; these tests drive mutations
      // directly so the assertions do not depend on filesystem event timing.
      watch: false,
      debounceMs: 5_000,
    });
  });

  afterEach(async () => {
    await service.stop();
    await rm(dataRoot, { recursive: true, force: true });
  });

  async function writeCredentials(value: unknown): Promise<void> {
    const file = path.join(dataRoot, 'connectors', 'credentials.json');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }

  async function readCredentials(): Promise<Record<string, unknown> | null> {
    try {
      const raw = await readFile(path.join(dataRoot, 'connectors', 'credentials.json'), 'utf8');
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  it('records a change still inside the debounce window before restoring over it', async () => {
    await writeCredentials({ github: { accountLabel: 'GitHub' } });
    await service.flush();
    const baseline = (await service.list()).revisions[0]!;

    // A mutation whose debounced capture has NOT fired yet: with a 5s debounce
    // and no flush, nothing has been committed for it.
    await writeCredentials({
      github: { accountLabel: 'GitHub' },
      slack: { accountLabel: 'Slack' },
    });
    service.recordMutation({ label: 'Added the Slack account' });

    await service.restore({ revisionId: baseline.id });
    expect(await readCredentials()).toEqual({ github: { accountLabel: 'GitHub' } });

    // The un-debounced state is a revision of its own rather than bytes the
    // restore silently overwrote, so the user can go back to it.
    const pending = (await service.list()).revisions
      .find((revision) => revision.label === 'Added the Slack account');
    expect(pending).toBeDefined();
    await service.restore({ revisionId: pending!.id });
    expect(await readCredentials()).toEqual({
      github: { accountLabel: 'GitHub' },
      slack: { accountLabel: 'Slack' },
    });
  });

  it('coalesces a burst of mutations into one revision', async () => {
    await writeCredentials({ github: { accountLabel: 'GitHub' } });
    service.recordMutation({ label: 'Added the GitHub account' });
    await writeCredentials({
      github: { accountLabel: 'GitHub' },
      slack: { accountLabel: 'Slack' },
    });
    service.recordMutation({ label: 'Added the Slack account' });
    await service.flush();

    const listed = await service.list();
    expect(listed.available).toBe(true);
    // initial + one coalesced revision, not one per edit.
    expect(listed.total).toBe(2);
    const newest = listed.revisions[0];
    expect(newest?.label).toBe('Added the GitHub account');
    expect(newest?.details).toEqual([
      'Added the GitHub account',
      'Added the Slack account',
    ]);
  });

  it('filters by domain, kind and search text', async () => {
    await writeCredentials({ github: { accountLabel: 'GitHub' } });
    await service.flush();
    await writeCredentials({});
    await service.flush();

    const byDomain = await service.list({ domainId: 'connectors' });
    expect(byDomain.total).toBe(2);

    const byMissingDomain = await service.list({ domainId: 'memory' });
    expect(byMissingDomain.total).toBe(0);

    const byKind = await service.list({ kind: 'initial' });
    expect(byKind.total).toBe(1);

    const byText = await service.list({ query: 'deleted the connector account' });
    expect(byText.total).toBe(1);

    const byRegex = await service.list({ query: '^Deleted the connector', regex: true });
    expect(byRegex.total).toBe(1);

    await expect(service.list({ query: '([', regex: true })).rejects.toThrow(/regular expression/u);
  });

  it('persists a retention policy and prunes only what falls outside it', async () => {
    for (const label of ['one', 'two', 'three', 'four']) {
      await writeCredentials({ [label]: { accountLabel: label } });
      await service.flush();
    }
    const before = await service.list();
    expect(before.total).toBe(5); // initial + four mutations

    const stored = await service.setRetention({ maxRevisions: 2, maxAgeDays: null });
    expect(stored).toEqual({ maxRevisions: 2, maxAgeDays: null });
    expect(await service.getRetention()).toEqual({ maxRevisions: 2, maxAgeDays: null });

    const preview = await service.prune({ dryRun: true });
    expect(preview.dryRun).toBe(true);
    expect(preview.removed).toHaveLength(3);
    expect(preview.keptCount).toBe(2);
    expect(preview.recorded).toBeNull();
    // A dry run is a preview: the log is untouched.
    expect((await service.list()).total).toBe(5);

    const keptIdsBefore = before.revisions.slice(0, 2).map((revision) => revision.id);
    const applied = await service.prune({ dryRun: false });
    expect(applied.removed).toHaveLength(3);
    expect(applied.recorded?.kind).toBe('prune');

    const after = await service.list();
    // Two retained revisions plus the prune event itself, which is appended
    // rather than hidden.
    expect(after.total).toBe(3);
    const idsAfter = after.revisions.map((revision) => revision.id);
    // Public revision ids survive a prune even though the commit hashes move.
    for (const id of keptIdsBefore) expect(idsAfter).toContain(id);
  });

  it('reports honestly when a revision does not exist', async () => {
    await expect(service.show('not-a-revision')).rejects.toThrow(/revision not found/u);
  });
});

describe.skipIf(!gitAvailable)('/api/history routes', () => {
  let dataRoot: string;
  let service: HistoryService;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), 'od-history-http-'));
    service = new HistoryService({
      dataRoot,
      domains: [CONNECTORS, VAULT],
      watch: false,
      debounceMs: 5_000,
    });

    const file = path.join(dataRoot, 'connectors', 'credentials.json');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify({ github: { accountLabel: 'GitHub' } }), 'utf8');
    await service.flush();

    const app = express();
    app.use(express.json());
    registerHistoryRoutes(app, {
      history: service,
      http: { requireLocalDaemonRequest },
    });
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await service.stop();
    await rm(dataRoot, { recursive: true, force: true });
  });

  it('lists revisions with their domains', async () => {
    const res = await fetch(`${baseUrl}/api/history`);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      available: boolean;
      revisions: Array<{ id: string; label: string }>;
      domains: Array<{ id: string; sensitive: boolean }>;
    };
    expect(body.available).toBe(true);
    expect(body.revisions.length).toBeGreaterThan(0);
    expect(body.domains.map((domain) => domain.id)).toContain('connectors');
    expect(body.domains.find((domain) => domain.id === 'connectors')?.sensitive).toBe(true);
  });

  it('withholds the stored bytes of a sensitive domain but still proves them', async () => {
    const listed = await (await fetch(`${baseUrl}/api/history`)).json() as {
      revisions: Array<{ id: string }>;
    };
    const revisionId = listed.revisions[0]?.id ?? '';
    const res = await fetch(
      `${baseUrl}/api/history/${revisionId}?path=${
        encodeURIComponent('records/connectors/connectors/credentials.json')
      }`,
    );
    expect(res.status).toBe(200);
    const body = await res.json() as {
      entry: { content: string | null; redacted: boolean; digest: string; size: number } | null;
    };
    expect(body.entry?.redacted).toBe(true);
    expect(body.entry?.content).toBeNull();
    expect(body.entry?.digest).toMatch(/^[a-f0-9]{64}$/u);
    expect(body.entry?.size).toBeGreaterThan(0);
  });

  it('rejects an entry path outside the records tree', async () => {
    const listed = await (await fetch(`${baseUrl}/api/history`)).json() as {
      revisions: Array<{ id: string }>;
    };
    const revisionId = listed.revisions[0]?.id ?? '';
    const res = await fetch(
      `${baseUrl}/api/history/${revisionId}?path=${encodeURIComponent('../../etc/passwd')}`,
    );
    expect(res.status).toBe(400);
  });

  it('restores through the HTTP surface and records the restore as a new revision', async () => {
    const file = path.join(dataRoot, 'connectors', 'credentials.json');
    const listedBefore = await (await fetch(`${baseUrl}/api/history`)).json() as {
      revisions: Array<{ id: string; kind: string }>;
      total: number;
    };
    const target = listedBefore.revisions[0]?.id ?? '';

    await writeFile(file, JSON.stringify({}), 'utf8');
    await service.flush();

    const res = await fetch(`${baseUrl}/api/history/restore`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ revisionId: target }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as {
      unchanged: boolean;
      recorded: { id: string; kind: string; restoredFromId: string | null } | null;
      from: { id: string };
    };
    expect(body.unchanged).toBe(false);
    expect(body.recorded?.kind).toBe('restore');
    expect(body.recorded?.restoredFromId).toBe(target);
    expect(body.from.id).toBe(target);
    expect(JSON.parse(await readFile(file, 'utf8')) as unknown).toEqual({
      github: { accountLabel: 'GitHub' },
    });

    const listedAfter = await (await fetch(`${baseUrl}/api/history`)).json() as { total: number };
    expect(listedAfter.total).toBe(listedBefore.total + 2);
  });

  it('rejects a restore without a revision id', async () => {
    const res = await fetch(`${baseUrl}/api/history/restore`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('404s an unknown revision', async () => {
    const res = await fetch(`${baseUrl}/api/history/00000000-0000-4000-8000-000000000000`);
    expect(res.status).toBe(404);
  });
});

describe('history domain declarations', () => {
  it('maps a repo path back to its domain', () => {
    expect(domainIdForRepoPath('records/connectors/connectors/credentials.json')).toBe('connectors');
    expect(domainIdForRepoPath('.gitattributes')).toBeNull();
    expect(domainIdForRepoPath('records')).toBeNull();
  });

  it('places every source under its own domain folder', () => {
    for (const domain of defaultHistoryDomains()) {
      for (const source of domain.sources) {
        expect(repoPathForSource(domain, source).startsWith(`records/${domain.id}/`)).toBe(true);
      }
    }
  });

  it('gives every shipped domain a unique id and a plural noun', () => {
    const domains = defaultHistoryDomains();
    const ids = domains.map((domain) => domain.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const domain of domains) {
      expect(domain.noun.length).toBeGreaterThan(0);
      expect(domain.nounPlural.length).toBeGreaterThan(0);
    }
  });

  it('says out loud that BYOK secrets are not captured', () => {
    const byok = defaultHistoryDomains().find((domain) => domain.id === 'byok');
    expect(byok?.note).toMatch(/keychain/u);
    expect(byok?.sensitive).toBe(true);
  });

  it('never declares a source inside a user project folder', () => {
    for (const domain of defaultHistoryDomains()) {
      for (const source of domain.sources) {
        if (source.kind === 'payload') continue;
        expect(source.dataPath.startsWith('projects/')).toBe(false);
        expect(source.dataPath.includes('..')).toBe(false);
      }
    }
  });

  it('names an added, changed and deleted record', () => {
    const before = Buffer.from(JSON.stringify({
      github: { accountLabel: 'GitHub' },
      slack: { accountLabel: 'Slack' },
    }), 'utf8');
    const after = Buffer.from(JSON.stringify({
      slack: { accountLabel: 'Slack workspace' },
      linear: { accountLabel: 'Linear' },
    }), 'utf8');
    const source = CONNECTORS.sources[0]!;
    expect(describeSourceChange(CONNECTORS, source, before, after)).toEqual([
      'Deleted the connector account GitHub',
      'Added the connector account Linear',
      'Updated the connector account Slack workspace',
    ]);
  });

  it('reads records out of a store that wraps them in a property', () => {
    const wrapped: HistoryDomain = {
      id: 'byok',
      label: 'BYOK provider profiles',
      noun: 'provider profile',
      nounPlural: 'provider profiles',
      sources: [
        {
          kind: 'file',
          dataPath: 'byok/profiles.json',
          recordKeys: 'array',
          recordsAt: 'profiles',
          idField: 'id',
          labelField: 'label',
        },
      ],
    };
    const source = wrapped.sources[0]!;
    const before = Buffer.from(JSON.stringify({
      version: 1,
      profiles: [{ id: 'p1', label: 'Local llama' }],
    }), 'utf8');
    const after = Buffer.from(JSON.stringify({ version: 1, profiles: [] }), 'utf8');
    expect(describeSourceChange(wrapped, source, before, after)).toEqual([
      'Deleted the provider profile Local llama',
    ]);
  });

  it('pairs every wrapped shipped store with the property its records live under', () => {
    // If one of these stores changes shape, the label silently degrades to
    // naming the wrapper's own keys — so the pairing is asserted, not assumed.
    const byId = new Map(defaultHistoryDomains().map((domain) => [domain.id, domain]));
    expect(byId.get('byok')?.sources[0]).toMatchObject({ recordsAt: 'profiles' });
    expect(byId.get('mcp')?.sources[0]).toMatchObject({ recordsAt: 'servers' });
    expect(byId.get('automations')?.sources[0]).toMatchObject({ recordsAt: 'templates' });
  });

  it('falls back quietly when a record file is not the shape it declared', () => {
    const source = CONNECTORS.sources[0]!;
    expect(describeSourceChange(CONNECTORS, source, Buffer.from('not json'), Buffer.from('{]'))).toEqual([]);
  });

  it('builds a SQLite domain that captures one payload keyed by a stable id', () => {
    const domain = createSqliteTableDomain({
      id: 'routines',
      label: 'Scheduled automations',
      noun: 'automation',
      nounPlural: 'automations',
      table: 'routines',
      labelColumn: 'name',
      getDb: () => null,
    });
    expect(domain.sources).toHaveLength(1);
    const source = domain.sources[0]!;
    expect(source.kind).toBe('payload');
    expect(source.recordKeys).toBe('array');
    expect(source.idField).toBe('id');
    expect(source.labelField).toBe('name');
    if (source.kind === 'payload') {
      // With no database open the domain captures an empty set rather than
      // throwing and taking the whole snapshot down with it.
      expect(source.read()).toEqual([]);
    }
  });

  it('refuses a table name that is not a plain identifier', () => {
    expect(() => createSqliteTableDomain({
      id: 'bad',
      label: 'Bad',
      noun: 'row',
      nounPlural: 'rows',
      table: 'routines; DROP TABLE projects',
      getDb: () => null,
    })).toThrow(/unsafe SQLite table name/u);
  });

  it('refuses an id column that is not a plain identifier', () => {
    expect(() => createSqliteTableDomain({
      id: 'bad',
      label: 'Bad',
      noun: 'row',
      nounPlural: 'rows',
      table: 'routines',
      idColumn: 'id" , (SELECT 1) -- ',
      getDb: () => null,
    })).toThrow(/unsafe SQLite id column name/u);
  });
});

// The `routines` table has two inbound `ON DELETE CASCADE` references and
// `PRAGMA foreign_keys` is ON, so a restore that emptied the table would take
// every automation run record and every claimed schedule slot with it — neither
// of which is a history domain, so neither could ever be restored. These tests
// run against the real schema from db.ts, because a stubbed database is exactly
// where that failure hides.
describe.skipIf(!gitAvailable)('SQLite history domains against the real schema', () => {
  let dataRoot: string;

  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), 'od-history-sqlite-'));
  });

  afterEach(async () => {
    closeDatabase();
    await rm(dataRoot, { recursive: true, force: true });
  });

  function openDb() {
    return openDatabase(dataRoot, { dataDir: path.join(dataRoot, 'db') });
  }

  function routineRow(id: string, name: string) {
    const now = Date.now();
    return {
      id,
      name,
      prompt: 'Summarise yesterday',
      scheduleKind: 'daily',
      scheduleValue: '09:00',
      scheduleJson: null,
      projectMode: 'create_each_run',
      projectId: null,
      skillId: null,
      agentId: null,
      contextJson: null,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
  }

  function runRow(id: string, routineId: string) {
    return {
      id,
      routineId,
      trigger: 'schedule',
      status: 'succeeded',
      projectId: `project-${routineId}`,
      conversationId: `conversation-${routineId}`,
      agentRunId: `agent-${routineId}`,
      startedAt: Date.now(),
    };
  }

  function routinesDomain(db: ReturnType<typeof openDatabase>): HistoryDomain {
    return createSqliteTableDomain({
      id: 'routines',
      label: 'Scheduled automations',
      noun: 'automation',
      nounPlural: 'automations',
      table: 'routines',
      labelColumn: 'name',
      // The driver's `transaction` is generic in a way the port's narrower
      // signature does not accept, so the handle is adapted at this boundary
      // rather than the port being widened to whatever one driver happens to
      // expose. The domain only ever calls `prepare` and `transaction`, both of
      // which this handle really has.
      getDb: () => db as unknown as SqliteLike,
    });
  }

  function claimCount(db: ReturnType<typeof openDatabase>, routineId: string): number {
    const row = db
      .prepare('SELECT COUNT(*) AS total FROM routine_schedule_claims WHERE routine_id = ?')
      .get(routineId) as { total: number } | undefined;
    return row?.total ?? 0;
  }

  it('restores a deleted automation without cascading away the run history of another', async () => {
    const db = openDb();
    insertRoutine(db, routineRow('routine-keep', 'Nightly digest'));
    insertRoutine(db, routineRow('routine-doomed', 'Weekly report'));
    insertScheduledRoutineRun(db, runRow('run-keep', 'routine-keep'), 1_700_000_000_000);
    insertScheduledRoutineRun(db, runRow('run-doomed', 'routine-doomed'), 1_700_000_000_000);

    const store = new HistoryStore({ dataRoot, domains: [routinesDomain(db)] });
    const both = await store.capture();
    expect(both.committed).toBe(true);

    // Delete one automation the ordinary way. Its own runs go with it, which is
    // what deleting an automation has always meant.
    expect(deleteRoutine(db, 'routine-doomed')).toBe(true);
    expect(await store.capture()).toMatchObject({ committed: true });
    expect(listRoutineRuns(db, 'routine-doomed')).toHaveLength(0);

    const restored = await store.restoreRevision(both.revision!.id);
    expect(restored.unchanged).toBe(false);
    expect(getRoutine(db, 'routine-doomed')?.name).toBe('Weekly report');

    // The untouched automation kept its run history and its claimed slot. A
    // `DELETE FROM routines` would have taken both, permanently, and neither is
    // in the history log to restore from.
    expect(listRoutineRuns(db, 'routine-keep').map((run) => run.id)).toEqual(['run-keep']);
    expect(claimCount(db, 'routine-keep')).toBe(1);
  });

  it('changes nothing at all when the snapshot already matches the table', async () => {
    const db = openDb();
    insertRoutine(db, routineRow('routine-keep', 'Nightly digest'));
    insertScheduledRoutineRun(db, runRow('run-keep', 'routine-keep'), 1_700_000_000_000);

    const store = new HistoryStore({ dataRoot, domains: [routinesDomain(db)] });
    const captured = await store.capture();

    const restored = await store.restoreRevision(captured.revision!.id);
    expect(restored.unchanged).toBe(true);
    expect(listRoutineRuns(db, 'routine-keep')).toHaveLength(1);
    expect(claimCount(db, 'routine-keep')).toBe(1);
  });

  it('brings back a renamed automation by updating it in place, not by replacing it', async () => {
    const db = openDb();
    insertRoutine(db, routineRow('routine-keep', 'Nightly digest'));
    insertScheduledRoutineRun(db, runRow('run-keep', 'routine-keep'), 1_700_000_000_000);

    const store = new HistoryStore({ dataRoot, domains: [routinesDomain(db)] });
    const original = await store.capture();

    updateRoutine(db, 'routine-keep', { name: 'Renamed digest' });
    expect(await store.capture()).toMatchObject({ committed: true });

    await store.restoreRevision(original.revision!.id);
    expect(getRoutine(db, 'routine-keep')?.name).toBe('Nightly digest');
    // An upsert, so the row never left the table and its dependents never
    // cascaded away.
    expect(listRoutineRuns(db, 'routine-keep').map((run) => run.id)).toEqual(['run-keep']);
    expect(claimCount(db, 'routine-keep')).toBe(1);
  });
});
