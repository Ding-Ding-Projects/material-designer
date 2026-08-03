// Persistence coverage for the "open in external editor" choice.
//
// The choice rides the ordinary app-config store, so what needs pinning is the
// validator: a stored value becomes an executable the daemon spawns, and the
// one thing that must never round-trip is a command carrying characters no
// real path has. Clearing the choice also has to persist as an explicit null —
// silently dropping the key would leave the daemon re-reading a stale id
// forever.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readAppConfig, validateExternalEditor, writeAppConfig } from '../src/app-config.js';

describe('externalEditor round-trips through app-config', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'od-editor-config-'));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('persists a catalogue choice', async () => {
    await writeAppConfig(dataDir, { externalEditor: { id: 'vscode' } });

    expect((await readAppConfig(dataDir)).externalEditor).toEqual({ id: 'vscode' });
  });

  it('persists a user-added executable with its label and folder support', async () => {
    await writeAppConfig(dataDir, {
      externalEditor: {
        id: 'custom',
        command: '/usr/local/bin/mine',
        label: 'Mine',
        supportsFolders: true,
      },
    });

    expect((await readAppConfig(dataDir)).externalEditor).toEqual({
      id: 'custom',
      command: '/usr/local/bin/mine',
      label: 'Mine',
      supportsFolders: true,
    });
  });

  it('stores an explicit null when the user clears the choice', async () => {
    await writeAppConfig(dataDir, { externalEditor: { id: 'zed' } });
    await writeAppConfig(dataDir, { externalEditor: null });

    const config = await readAppConfig(dataDir);
    expect(config.externalEditor).toBeNull();
    // Not merely absent: the daemon reads this to decide whether to auto-pick.
    expect(Object.prototype.hasOwnProperty.call(config, 'externalEditor')).toBe(true);
  });

  it('leaves the previous choice alone when an unrelated key is written', async () => {
    await writeAppConfig(dataDir, { externalEditor: { id: 'cursor' } });
    await writeAppConfig(dataDir, { onboardingCompleted: true });

    expect((await readAppConfig(dataDir)).externalEditor).toEqual({ id: 'cursor' });
  });
});

describe('validateExternalEditor', () => {
  it('keeps null distinct from an invalid value', () => {
    // null = "clear it"; undefined = "this failed validation, drop the write".
    expect(validateExternalEditor(null)).toBeNull();
    expect(validateExternalEditor(undefined)).toBeUndefined();
    expect(validateExternalEditor('vscode')).toBeUndefined();
    expect(validateExternalEditor([{ id: 'vscode' }])).toBeUndefined();
    expect(validateExternalEditor({})).toBeUndefined();
    expect(validateExternalEditor({ id: '   ' })).toBeUndefined();
  });

  it('refuses a custom editor with no executable — that is a broken choice, not a choice', () => {
    expect(validateExternalEditor({ id: 'custom' })).toBeUndefined();
    expect(validateExternalEditor({ id: 'custom', command: '  ' })).toBeUndefined();
  });

  it('drops a command carrying control characters rather than persisting it', () => {
    // A NUL truncates an argv element; no real executable path has one.
    expect(validateExternalEditor({ id: 'custom', command: '/bin/x\u0000--wait' })).toBeUndefined();
    expect(validateExternalEditor({ id: 'custom', command: '/bin/x\u001b[31m' })).toBeUndefined();
    expect(validateExternalEditor({ id: 'vscode', command: '/bin/x\u007f' })).toEqual({
      id: 'vscode',
    });
  });

  it('drops a relative command rather than resolving it against the daemon cwd', () => {
    // Nothing downstream re-checks this: `resolveCustomEntry` hands the stored
    // value to a bare `stat`, so a relative path would be resolved against
    // whatever directory the daemon happens to be running in and then spawned.
    expect(validateExternalEditor({ id: 'custom', command: 'code' })).toBeUndefined();
    expect(validateExternalEditor({ id: 'custom', command: 'tools/mine' })).toBeUndefined();
    expect(validateExternalEditor({ id: 'custom', command: './mine' })).toBeUndefined();
    // A catalogue id keeps its own choice and loses only the unusable command,
    // exactly as it does for a control character.
    expect(validateExternalEditor({ id: 'vscode', command: 'code' })).toEqual({ id: 'vscode' });
  });

  it('stores no argument template — only the executable path', () => {
    const stored = validateExternalEditor({
      id: 'custom',
      command: '/usr/local/bin/mine',
      label: 'Mine',
      args: ['--wait', '--reuse-window'],
      cwd: '/tmp',
      env: { EVIL: '1' },
    });

    // The daemon builds the argument vector itself, so a stored value can
    // never smuggle in a flag, a working directory, or an environment.
    expect(stored).toEqual({ id: 'custom', command: '/usr/local/bin/mine', label: 'Mine' });
  });

  it('bounds the id and the label', () => {
    expect(validateExternalEditor({ id: 'x'.repeat(65) })).toBeUndefined();
    const stored = validateExternalEditor({ id: 'vscode', label: 'y'.repeat(400) });
    expect(stored?.label).toHaveLength(120);
  });
});
