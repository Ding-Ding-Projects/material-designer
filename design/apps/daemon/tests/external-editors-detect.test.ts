// Detection coverage for "open in external editor".
//
// The probe is injected, so every platform's catalogue is exercised from any
// host — the Windows per-user install location is asserted on Linux CI, and
// the macOS bundle layout on Windows. What is pinned here is the behaviour the
// feature promises: VS Code resolves from the places it actually installs to
// (PATH shim, per-user, machine, Insiders, portable, env pin), a miss REPORTS
// what it looked at, and an explicit choice that is gone never silently
// becomes some other editor.

import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { EDITOR_CATALOGUE, detectEditors } from '../src/external-editors.js';
import type { EditorProbe } from '../src/external-editors.js';

/** A probe where only the named commands/paths exist. */
function fakeProbe(present: { onPath?: string[]; atPath?: string[] } = {}): EditorProbe {
  const onPath = new Set(present.onPath ?? []);
  const atPath = new Set(present.atPath ?? []);
  return {
    onPath: async (command) => (onPath.has(command) ? `/usr/local/bin/${command}` : null),
    atPath: async (candidate) => (atPath.has(candidate) ? candidate : null),
  };
}

const WIN_ENV: NodeJS.ProcessEnv = {
  LOCALAPPDATA: 'C:\\Users\\dev\\AppData\\Local',
  ProgramFiles: 'C:\\Program Files',
  PATH: '',
};

const LINUX_ENV: NodeJS.ProcessEnv = { HOME: '/home/dev', PATH: '' };

const WIN_VSCODE_USER_EXE = path.win32.join(
  'C:\\Users\\dev\\AppData\\Local',
  'Programs',
  'Microsoft VS Code',
  'Code.exe',
);

describe('VS Code detection covers every install shape', () => {
  it('finds the $PATH shim first — that is what the user own shell would run', async () => {
    const result = await detectEditors({
      platform: 'linux',
      env: LINUX_ENV,
      probe: fakeProbe({ onPath: ['code'] }),
      selected: null,
    });

    const vscode = result.editors.find((editor) => editor.id === 'vscode');
    expect(vscode?.available).toBe(true);
    expect(vscode?.source).toBe('path');
    expect(vscode?.command).toBe('/usr/local/bin/code');
    expect(result.vscodeAvailable).toBe(true);
  });

  it('finds the Windows per-user install when nothing is on $PATH', async () => {
    const result = await detectEditors({
      platform: 'win32',
      env: WIN_ENV,
      probe: fakeProbe({ atPath: [WIN_VSCODE_USER_EXE] }),
      selected: null,
    });

    const vscode = result.editors.find((editor) => editor.id === 'vscode');
    expect(vscode?.available).toBe(true);
    expect(vscode?.source).toBe('well-known');
    expect(vscode?.command).toBe(WIN_VSCODE_USER_EXE);
  });

  it('finds the Windows machine-wide install under Program Files', async () => {
    const machineExe = path.win32.join('C:\\Program Files', 'Microsoft VS Code', 'Code.exe');
    const result = await detectEditors({
      platform: 'win32',
      env: WIN_ENV,
      probe: fakeProbe({ atPath: [machineExe] }),
      selected: null,
    });

    expect(result.editors.find((editor) => editor.id === 'vscode')?.command).toBe(machineExe);
  });

  it('finds the macOS app-bundle CLI shim', async () => {
    const bundleCli = '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code';
    const result = await detectEditors({
      platform: 'darwin',
      env: { HOME: '/Users/dev', PATH: '' },
      probe: fakeProbe({ atPath: [bundleCli] }),
      selected: null,
    });

    expect(result.editors.find((editor) => editor.id === 'vscode')?.command).toBe(bundleCli);
  });

  it('finds Insiders as its own entry, not as stable VS Code', async () => {
    const result = await detectEditors({
      platform: 'linux',
      env: LINUX_ENV,
      probe: fakeProbe({ onPath: ['code-insiders'] }),
      selected: null,
    });

    expect(result.editors.find((editor) => editor.id === 'vscode')?.available).toBe(false);
    expect(result.editors.find((editor) => editor.id === 'vscode-insiders')?.available).toBe(true);
    // Insiders still satisfies "VS Code is available" — it is the same editor.
    expect(result.vscodeAvailable).toBe(true);
  });

  it('finds a portable checkout through VSCODE_PORTABLE', async () => {
    // A portable build is invisible to $PATH and to every well-known location,
    // so without this branch the one deliberately relocatable install style
    // would always report missing.
    const portableExe = path.win32.join('D:\\Tools\\VSCode', 'Code.exe');
    const result = await detectEditors({
      platform: 'win32',
      env: { ...WIN_ENV, VSCODE_PORTABLE: 'D:\\Tools\\VSCode\\data' },
      probe: fakeProbe({ atPath: [portableExe] }),
      selected: null,
    });

    const vscode = result.editors.find((editor) => editor.id === 'vscode');
    expect(vscode?.available).toBe(true);
    expect(vscode?.source).toBe('portable');
  });

  it('lets OD_VSCODE_BIN pin an install none of the probes would find', async () => {
    const pinned = '/opt/vendor/relocated/code';
    const result = await detectEditors({
      platform: 'linux',
      env: { ...LINUX_ENV, OD_VSCODE_BIN: pinned },
      probe: fakeProbe({ atPath: [pinned] }),
      selected: null,
    });

    const vscode = result.editors.find((editor) => editor.id === 'vscode');
    expect(vscode?.source).toBe('env');
    expect(vscode?.command).toBe(pinned);
  });
});

describe('a miss is reported, not asserted', () => {
  it('reports every command name and location it probed when nothing resolves', async () => {
    const result = await detectEditors({
      platform: 'win32',
      env: WIN_ENV,
      probe: fakeProbe(),
      selected: null,
    });

    const vscode = result.editors.find((editor) => editor.id === 'vscode');
    expect(vscode?.available).toBe(false);
    expect(vscode?.command).toBeUndefined();
    // "not installed" on its own is unactionable; the probe trail is what lets
    // a user see which assumption was wrong.
    expect(vscode?.probedCommands).toContain('code.cmd');
    expect(vscode?.probedPaths).toContain(WIN_VSCODE_USER_EXE);
    expect(result.vscodeAvailable).toBe(false);
    expect(result.effectiveEditorId).toBeNull();
    // The download link is always present so the client never has to invent one.
    expect(result.vscodeDownloadUrl).toBe('https://code.visualstudio.com/Download');
  });

  it('carries a download URL on every catalogue entry', () => {
    for (const entry of EDITOR_CATALOGUE) {
      expect(entry.downloadUrl).toMatch(/^https:\/\//);
    }
  });
});

describe('choosing which editor would actually run', () => {
  it('auto-picks VS Code ahead of the others when the user has not chosen', async () => {
    const result = await detectEditors({
      platform: 'linux',
      env: LINUX_ENV,
      probe: fakeProbe({ onPath: ['cursor', 'zed', 'code'] }),
      selected: null,
    });

    expect(result.selectedEditorId).toBeNull();
    expect(result.effectiveEditorId).toBe('vscode');
  });

  it('auto-picks the next available editor when VS Code is absent', async () => {
    const result = await detectEditors({
      platform: 'linux',
      env: LINUX_ENV,
      probe: fakeProbe({ onPath: ['zed'] }),
      selected: null,
    });

    expect(result.effectiveEditorId).toBe('zed');
  });

  it('honours an explicit choice over the auto-preference order', async () => {
    const result = await detectEditors({
      platform: 'linux',
      env: LINUX_ENV,
      probe: fakeProbe({ onPath: ['code', 'zed'] }),
      selected: { id: 'zed' },
    });

    expect(result.selectedEditorId).toBe('zed');
    expect(result.effectiveEditorId).toBe('zed');
  });

  it('never falls back when the chosen editor is gone, even with VS Code installed', async () => {
    // The honest-degradation rule. Silently launching an editor the user did
    // not pick is worse than telling them the one they picked is missing.
    const result = await detectEditors({
      platform: 'linux',
      env: LINUX_ENV,
      probe: fakeProbe({ onPath: ['code'] }),
      selected: { id: 'cursor' },
    });

    expect(result.vscodeAvailable).toBe(true);
    expect(result.selectedEditorId).toBe('cursor');
    expect(result.effectiveEditorId).toBeNull();
  });
});

describe('a user-added custom editor', () => {
  it('appears in the list and becomes effective once its executable resolves', async () => {
    const mine = '/opt/mine/bin/mine';
    const result = await detectEditors({
      platform: 'linux',
      env: LINUX_ENV,
      probe: fakeProbe({ atPath: [mine] }),
      selected: { id: 'custom', command: mine, label: 'Mine', supportsFolders: true },
    });

    const custom = result.editors.find((editor) => editor.id === 'custom');
    expect(custom?.available).toBe(true);
    expect(custom?.label).toBe('Mine');
    expect(custom?.source).toBe('configured');
    expect(custom?.supportsFolders).toBe(true);
    expect(result.effectiveEditorId).toBe('custom');
  });

  it('defaults to NOT claiming folder support the user never confirmed', async () => {
    // Guessing wrong here produces the exact failure this feature exists to
    // avoid: a file opened with no surrounding project.
    const mine = '/opt/mine/bin/mine';
    const result = await detectEditors({
      platform: 'linux',
      env: LINUX_ENV,
      probe: fakeProbe({ atPath: [mine] }),
      selected: { id: 'custom', command: mine },
    });

    expect(result.editors.find((editor) => editor.id === 'custom')?.supportsFolders).toBe(false);
  });

  it('reports the configured executable as missing rather than picking another editor', async () => {
    const result = await detectEditors({
      platform: 'linux',
      env: LINUX_ENV,
      probe: fakeProbe({ onPath: ['code'] }),
      selected: { id: 'custom', command: '/opt/gone/mine' },
    });

    const custom = result.editors.find((editor) => editor.id === 'custom');
    expect(custom?.available).toBe(false);
    expect(custom?.probedPaths).toEqual(['/opt/gone/mine']);
    expect(result.effectiveEditorId).toBeNull();
  });
});

describe('platform gating', () => {
  it('returns no catalogue entries on an unsupported platform', async () => {
    const result = await detectEditors({
      platform: 'unknown',
      env: LINUX_ENV,
      probe: fakeProbe({ onPath: ['code'] }),
      selected: null,
    });

    expect(result.editors).toEqual([]);
    expect(result.vscodeAvailable).toBe(false);
    expect(result.effectiveEditorId).toBeNull();
  });
});
