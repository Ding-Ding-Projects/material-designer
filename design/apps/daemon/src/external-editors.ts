// Detection and launch-plan construction for "open in external editor".
//
// Visual Studio Code is the entry that must always work, so it gets the widest
// probe: the `$PATH` shim, the per-user and machine install locations, the
// Insiders build, and a portable checkout located through `VSCODE_PORTABLE`.
// Everything probed is reported back (`probedCommands` / `probedPaths`) so a
// miss is an answer the user can act on rather than a bare "not installed".
//
// Two invariants this module exists to hold.
//
// 1. A FOLDER TARGET OPENS AS A WORKSPACE ROOT. Every catalogue entry here
//    takes a directory as a positional argument and opens it as the window's
//    root folder, so the file tree is usable. An editor that cannot do that is
//    marked `supportsFolders: false` and the caller is told, instead of being
//    silently downgraded to "one file in an empty window".
//
// 2. A PATH IS DATA, NEVER A COMMAND FRAGMENT. Nothing here builds a command
//    line: `buildEditorLaunchArgs` returns an argument vector, and every path
//    in it goes through `assertEditorPathArg`, which rejects NUL bytes and
//    anything that is not an absolute normalized path. Shell metacharacters
//    (`&`, `|`, `` ` ``, `$(…)`, newlines) are inert in an argv element, and
//    the absoluteness rule is the argv-level counterpart: an absolute path can
//    never be read as an option by the editor CLI. The actual spawn stays on
//    `launchHostTool` (no `shell: true`, `.cmd`/`.bat` routed through
//    `createCommandInvocation`), so no shell ever sees these strings.
//
// Detection is dependency-injected (`EditorProbe`, `env`, `platform`) so the
// catalogue can be exercised for every platform from any host.

import { access, constants as fsConstants, stat } from 'node:fs/promises';
import nodePath from 'node:path';
import {
  EXTERNAL_EDITOR_AUTO_PREFERENCE,
  VS_CODE_DOWNLOAD_URL,
  VS_CODE_EDITOR_IDS,
  type DetectedEditor,
  type EditorDetectResponse,
  type EditorDetectionSource,
  type EditorPlatform,
  type ExternalEditorId,
  type ExternalEditorPrefs,
} from '@open-design/contracts';

export type RealEditorPlatform = 'darwin' | 'win32' | 'linux';

/** Minimal `node:path` surface used for argument construction, so tests can
 *  drive the win32 and posix flavours on any host. */
export interface EditorPathApi {
  isAbsolute: (value: string) => boolean;
  normalize: (value: string) => string;
}

/** Filesystem probes, injected so detection is testable without a real install. */
export interface EditorProbe {
  /** Resolve a bare command name through `$PATH`, or null when it is absent. */
  onPath: (command: string) => Promise<string | null>;
  /** Confirm an absolute candidate is an executable file, or null. */
  atPath: (candidate: string) => Promise<string | null>;
}

export interface EditorCatalogueEntry {
  id: ExternalEditorId;
  label: string;
  /** True when a directory argument opens as the window's workspace root. */
  supportsFolders: boolean;
  downloadUrl: string;
  /** Env var that pins the executable outright. Highest precedence. */
  envOverride?: string;
  /** `$PATH` names per platform, in preference order. */
  pathCommands: Record<RealEditorPlatform, string[]>;
  /** Per-user and machine install locations, in preference order. */
  wellKnownPaths: (env: NodeJS.ProcessEnv, platform: RealEditorPlatform) => string[];
  /** Relocatable installs discovered from the environment (portable builds). */
  portablePaths?: (env: NodeJS.ProcessEnv, platform: RealEditorPlatform) => string[];
}

const VS_CODE_DOWNLOAD = VS_CODE_DOWNLOAD_URL;

function home(env: NodeJS.ProcessEnv): string {
  return env.HOME ?? env.USERPROFILE ?? '';
}

// Windows installs land under one of these roots depending on whether the
// installer was the per-user ("User Installer") or machine ("System
// Installer") build — both are checked, per-user first because that is the
// default download on code.visualstudio.com.
function windowsProgramRoots(env: NodeJS.ProcessEnv): string[] {
  const localAppData = env.LOCALAPPDATA;
  const roots = [
    localAppData ? nodePath.win32.join(localAppData, 'Programs') : '',
    env.ProgramFiles ?? '',
    env.ProgramW6432 ?? '',
    env['ProgramFiles(x86)'] ?? '',
  ];
  return dedupe(roots.filter((entry) => entry.length > 0));
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function macAppBinaries(env: NodeJS.ProcessEnv, appName: string, binary: string): string[] {
  const suffix = `${appName}.app/Contents/Resources/app/bin/${binary}`;
  const userApps = home(env) ? [nodePath.posix.join(home(env), 'Applications', suffix)] : [];
  return [nodePath.posix.join('/Applications', suffix), ...userApps];
}

function linuxBinaries(env: NodeJS.ProcessEnv, names: string[], extra: string[] = []): string[] {
  const dirs = ['/usr/bin', '/usr/local/bin', '/snap/bin', '/var/lib/flatpak/exports/bin'];
  const userDirs = home(env) ? [nodePath.posix.join(home(env), '.local', 'bin')] : [];
  const out: string[] = [];
  for (const dir of [...dirs, ...userDirs]) {
    for (const name of names) out.push(nodePath.posix.join(dir, name));
  }
  return dedupe([...out, ...extra]);
}

// `VSCODE_PORTABLE` points at the portable build's `data` directory; the
// executable sits beside it in the parent. A portable checkout is invisible to
// `$PATH` and to every well-known location, so without this branch the one
// install style that is deliberately relocatable would always report missing.
function vsCodePortablePaths(
  env: NodeJS.ProcessEnv,
  platform: RealEditorPlatform,
  exeName: string,
  cmdName: string,
  appName: string,
  binary: string,
): string[] {
  const portable = env.VSCODE_PORTABLE;
  if (!portable) return [];
  if (platform === 'win32') {
    const root = nodePath.win32.dirname(portable);
    return [
      nodePath.win32.join(root, exeName),
      nodePath.win32.join(root, 'bin', cmdName),
    ];
  }
  const root = nodePath.posix.dirname(portable);
  if (platform === 'darwin') {
    return [nodePath.posix.join(root, `${appName}.app/Contents/Resources/app/bin/${binary}`)];
  }
  return [nodePath.posix.join(root, 'bin', binary), nodePath.posix.join(root, binary)];
}

/**
 * The editors the daemon knows how to detect and launch. Every entry takes a
 * directory as a positional argument and opens it as a workspace root, which
 * is why `buildEditorLaunchArgs` needs no per-editor argument templates.
 *
 * `custom` is deliberately absent: it has no probe locations, because its
 * executable comes from the user's own app-config entry.
 */
export const EDITOR_CATALOGUE: ReadonlyArray<EditorCatalogueEntry> = [
  {
    id: 'vscode',
    label: 'Visual Studio Code',
    supportsFolders: true,
    downloadUrl: VS_CODE_DOWNLOAD,
    envOverride: 'OD_VSCODE_BIN',
    pathCommands: { win32: ['code.cmd', 'code'], darwin: ['code'], linux: ['code'] },
    wellKnownPaths: (env, platform) => {
      if (platform === 'win32') {
        return windowsProgramRoots(env).flatMap((root) => [
          nodePath.win32.join(root, 'Microsoft VS Code', 'Code.exe'),
          nodePath.win32.join(root, 'Microsoft VS Code', 'bin', 'code.cmd'),
        ]);
      }
      if (platform === 'darwin') return macAppBinaries(env, 'Visual Studio Code', 'code');
      return linuxBinaries(env, ['code'], [
        '/usr/share/code/bin/code',
        '/opt/visual-studio-code/bin/code',
        '/var/lib/flatpak/exports/bin/com.visualstudio.code',
      ]);
    },
    portablePaths: (env, platform) =>
      vsCodePortablePaths(env, platform, 'Code.exe', 'code.cmd', 'Visual Studio Code', 'code'),
  },
  {
    id: 'vscode-insiders',
    label: 'Visual Studio Code — Insiders',
    supportsFolders: true,
    downloadUrl: 'https://code.visualstudio.com/insiders/',
    envOverride: 'OD_VSCODE_INSIDERS_BIN',
    pathCommands: {
      win32: ['code-insiders.cmd', 'code-insiders'],
      darwin: ['code-insiders'],
      linux: ['code-insiders'],
    },
    wellKnownPaths: (env, platform) => {
      if (platform === 'win32') {
        return windowsProgramRoots(env).flatMap((root) => [
          nodePath.win32.join(root, 'Microsoft VS Code Insiders', 'Code - Insiders.exe'),
          nodePath.win32.join(root, 'Microsoft VS Code Insiders', 'bin', 'code-insiders.cmd'),
        ]);
      }
      if (platform === 'darwin') {
        return macAppBinaries(env, 'Visual Studio Code - Insiders', 'code-insiders');
      }
      return linuxBinaries(env, ['code-insiders'], ['/usr/share/code-insiders/bin/code-insiders']);
    },
    portablePaths: (env, platform) =>
      vsCodePortablePaths(
        env,
        platform,
        'Code - Insiders.exe',
        'code-insiders.cmd',
        'Visual Studio Code - Insiders',
        'code-insiders',
      ),
  },
  {
    id: 'cursor',
    label: 'Cursor',
    supportsFolders: true,
    downloadUrl: 'https://cursor.com/downloads',
    pathCommands: { win32: ['cursor.cmd', 'cursor'], darwin: ['cursor'], linux: ['cursor'] },
    wellKnownPaths: (env, platform) => {
      if (platform === 'win32') {
        return windowsProgramRoots(env).flatMap((root) => [
          nodePath.win32.join(root, 'cursor', 'Cursor.exe'),
          nodePath.win32.join(root, 'cursor', 'resources', 'app', 'bin', 'cursor.cmd'),
        ]);
      }
      if (platform === 'darwin') return macAppBinaries(env, 'Cursor', 'cursor');
      return linuxBinaries(env, ['cursor'], ['/opt/cursor/cursor']);
    },
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    supportsFolders: true,
    downloadUrl: 'https://windsurf.com/download',
    pathCommands: { win32: ['windsurf.cmd', 'windsurf'], darwin: ['windsurf'], linux: ['windsurf'] },
    wellKnownPaths: (env, platform) => {
      if (platform === 'win32') {
        return windowsProgramRoots(env).flatMap((root) => [
          nodePath.win32.join(root, 'Windsurf', 'Windsurf.exe'),
          nodePath.win32.join(root, 'Windsurf', 'bin', 'windsurf.cmd'),
        ]);
      }
      if (platform === 'darwin') return macAppBinaries(env, 'Windsurf', 'windsurf');
      return linuxBinaries(env, ['windsurf'], ['/opt/windsurf/windsurf']);
    },
  },
  {
    id: 'zed',
    label: 'Zed',
    supportsFolders: true,
    downloadUrl: 'https://zed.dev/download',
    pathCommands: { win32: ['zed.exe', 'zed'], darwin: ['zed'], linux: ['zed', 'zeditor'] },
    wellKnownPaths: (env, platform) => {
      if (platform === 'win32') {
        return windowsProgramRoots(env).map((root) => nodePath.win32.join(root, 'Zed', 'Zed.exe'));
      }
      if (platform === 'darwin') {
        // Zed ships its CLI at Contents/MacOS/cli rather than the VS Code
        // Resources/app/bin layout, so it does not go through macAppBinaries.
        const userApp = home(env)
          ? [nodePath.posix.join(home(env), 'Applications', 'Zed.app/Contents/MacOS/cli')]
          : [];
        return ['/Applications/Zed.app/Contents/MacOS/cli', ...userApp];
      }
      const userZed = home(env)
        ? [nodePath.posix.join(home(env), '.local', 'zed.app', 'bin', 'zed')]
        : [];
      return linuxBinaries(env, ['zed', 'zeditor'], userZed);
    },
  },
  {
    id: 'sublime',
    label: 'Sublime Text',
    supportsFolders: true,
    downloadUrl: 'https://www.sublimetext.com/download',
    pathCommands: { win32: ['subl.exe', 'subl'], darwin: ['subl'], linux: ['subl'] },
    wellKnownPaths: (env, platform) => {
      if (platform === 'win32') {
        return windowsProgramRoots(env).flatMap((root) => [
          nodePath.win32.join(root, 'Sublime Text', 'subl.exe'),
          nodePath.win32.join(root, 'Sublime Text 3', 'subl.exe'),
        ]);
      }
      if (platform === 'darwin') {
        const suffix = 'Sublime Text.app/Contents/SharedSupport/bin/subl';
        const userApp = home(env)
          ? [nodePath.posix.join(home(env), 'Applications', suffix)]
          : [];
        return [nodePath.posix.join('/Applications', suffix), ...userApp];
      }
      return linuxBinaries(env, ['subl'], ['/opt/sublime_text/sublime_text']);
    },
  },
  {
    id: 'webstorm',
    label: 'WebStorm',
    supportsFolders: true,
    downloadUrl: 'https://www.jetbrains.com/webstorm/download/',
    pathCommands: { win32: ['webstorm.cmd', 'webstorm'], darwin: ['webstorm'], linux: ['webstorm'] },
    wellKnownPaths: (env, platform) => jetBrainsPaths(env, platform, 'webstorm', 'WebStorm'),
  },
  {
    id: 'idea',
    label: 'IntelliJ IDEA',
    supportsFolders: true,
    downloadUrl: 'https://www.jetbrains.com/idea/download/',
    pathCommands: { win32: ['idea.cmd', 'idea'], darwin: ['idea'], linux: ['idea'] },
    wellKnownPaths: (env, platform) => jetBrainsPaths(env, platform, 'idea', 'IntelliJ IDEA'),
  },
];

// JetBrains IDEs are usually installed through Toolbox, which drops a launcher
// script in its own scripts directory rather than anywhere conventional.
function jetBrainsPaths(
  env: NodeJS.ProcessEnv,
  platform: RealEditorPlatform,
  script: string,
  appName: string,
): string[] {
  if (platform === 'win32') {
    const localAppData = env.LOCALAPPDATA;
    const toolbox = localAppData
      ? [nodePath.win32.join(localAppData, 'JetBrains', 'Toolbox', 'scripts', `${script}.cmd`)]
      : [];
    return dedupe([
      ...toolbox,
      ...windowsProgramRoots(env).map((root) =>
        nodePath.win32.join(root, 'JetBrains', appName, 'bin', `${script}64.exe`),
      ),
    ]);
  }
  if (platform === 'darwin') {
    const suffix = `${appName}.app/Contents/MacOS/${script}`;
    const userApp = home(env) ? [nodePath.posix.join(home(env), 'Applications', suffix)] : [];
    const toolbox = home(env)
      ? [nodePath.posix.join(home(env), 'Library', 'Application Support', 'JetBrains', 'Toolbox', 'scripts', script)]
      : [];
    return dedupe([...toolbox, nodePath.posix.join('/Applications', suffix), ...userApp]);
  }
  const toolbox = home(env)
    ? [nodePath.posix.join(home(env), '.local', 'share', 'JetBrains', 'Toolbox', 'scripts', script)]
    : [];
  return dedupe([...toolbox, ...linuxBinaries(env, [script])]);
}

export function currentEditorPlatform(platform: string = process.platform): EditorPlatform {
  switch (platform) {
    case 'darwin':
      return 'darwin';
    case 'win32':
      return 'win32';
    case 'linux':
      return 'linux';
    default:
      return 'unknown';
  }
}

// Mirrors the PATH widening in routes/host-tools.ts: a macOS GUI app inherits a
// very thin PATH with no /usr/local/bin or /opt/homebrew/bin, so a `code` shim
// installed through VS Code's own "Shell Command: Install 'code' command"
// would otherwise be invisible to a daemon launched from the app bundle.
function pathDirs(env: NodeJS.ProcessEnv, platform: EditorPlatform): string[] {
  const raw = env.PATH ?? env.Path ?? '';
  const sep = platform === 'win32' ? ';' : ':';
  const userHome = home(env);
  const extras =
    platform === 'darwin'
      ? ['/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin', ...(userHome ? [`${userHome}/.local/bin`] : [])]
      : platform === 'linux'
        ? ['/usr/local/bin', '/usr/bin', '/bin', ...(userHome ? [`${userHome}/.local/bin`] : [])]
        : [];
  return dedupe([...raw.split(sep), ...extras].filter((entry) => entry.length > 0));
}

async function isExecutableFile(candidate: string): Promise<boolean> {
  try {
    const info = await stat(candidate);
    // A directory named `code` on $PATH would otherwise pass an X_OK check and
    // be spawned as an editor.
    if (!info.isFile()) return false;
  } catch {
    return false;
  }
  try {
    await access(candidate, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Real filesystem probe. Detection takes this by injection so the catalogue
 *  can be exercised for every platform from any host. */
export function createFsEditorProbe(
  env: NodeJS.ProcessEnv = process.env,
  platform: EditorPlatform = currentEditorPlatform(),
): EditorProbe {
  const joiner = platform === 'win32' ? nodePath.win32 : nodePath.posix;
  return {
    async atPath(candidate: string): Promise<string | null> {
      return (await isExecutableFile(candidate)) ? candidate : null;
    },
    async onPath(command: string): Promise<string | null> {
      // Windows resolves a bare name against PATHEXT; the catalogue already
      // names the extension it wants (`code.cmd`), so only the bare form needs
      // the fallback sweep.
      const suffixes = platform === 'win32' && !nodePath.win32.extname(command) ? ['.exe', '.cmd', '.bat', ''] : [''];
      for (const dir of pathDirs(env, platform)) {
        for (const suffix of suffixes) {
          const candidate = joiner.join(dir, `${command}${suffix}`);
          if (await isExecutableFile(candidate)) return candidate;
        }
      }
      return null;
    },
  };
}

/** A `custom` entry is only real once the user has stored an executable for it. */
export function normalizeExternalEditorPrefs(raw: unknown): ExternalEditorPrefs | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  if (!id) return null;
  const command = typeof value.command === 'string' ? value.command.trim() : '';
  if (id === 'custom' && !command) return null;
  const label = typeof value.label === 'string' ? value.label.trim() : '';
  return {
    id,
    ...(command ? { command } : {}),
    ...(label ? { label } : {}),
    ...(typeof value.supportsFolders === 'boolean' ? { supportsFolders: value.supportsFolders } : {}),
  };
}

async function resolveEntry(
  entry: EditorCatalogueEntry,
  platform: RealEditorPlatform,
  env: NodeJS.ProcessEnv,
  probe: EditorProbe,
): Promise<DetectedEditor> {
  const probedCommands = entry.pathCommands[platform] ?? [];
  const wellKnown = entry.wellKnownPaths(env, platform);
  const portable = entry.portablePaths?.(env, platform) ?? [];
  const envOverride = entry.envOverride ? env[entry.envOverride]?.trim() : '';
  const probedPaths = dedupe([...(envOverride ? [envOverride] : []), ...portable, ...wellKnown]);

  const base = {
    id: entry.id,
    label: entry.label,
    supportsFolders: entry.supportsFolders,
    downloadUrl: entry.downloadUrl,
    probedCommands: [...probedCommands],
    probedPaths,
  };

  // Precedence: an explicit env pin, then the shim the user's own shell would
  // use, then a portable checkout, then the install locations.
  const attempts: Array<{ candidate: string; source: EditorDetectionSource; viaPath: boolean }> = [
    ...(envOverride ? [{ candidate: envOverride, source: 'env' as const, viaPath: false }] : []),
    ...probedCommands.map((command) => ({ candidate: command, source: 'path' as const, viaPath: true })),
    ...portable.map((candidate) => ({ candidate, source: 'portable' as const, viaPath: false })),
    ...wellKnown.map((candidate) => ({ candidate, source: 'well-known' as const, viaPath: false })),
  ];

  for (const attempt of attempts) {
    const resolved = attempt.viaPath
      ? await probe.onPath(attempt.candidate)
      : await probe.atPath(attempt.candidate);
    if (resolved) {
      return { ...base, available: true, command: resolved, source: attempt.source };
    }
  }
  return { ...base, available: false };
}

async function resolveCustomEntry(
  prefs: ExternalEditorPrefs,
  probe: EditorProbe,
): Promise<DetectedEditor> {
  const command = typeof prefs.command === 'string' ? prefs.command.trim() : '';
  const label = (typeof prefs.label === 'string' && prefs.label.trim()) || 'Custom editor';
  const base = {
    id: 'custom' as const,
    label,
    // A user-added executable is assumed NOT to accept a folder as a workspace
    // root unless the user said so, because guessing wrong here produces the
    // exact failure this feature exists to avoid: a file opened with no
    // surrounding project.
    supportsFolders: prefs.supportsFolders === true,
    downloadUrl: VS_CODE_DOWNLOAD,
    probedCommands: [] as string[],
    probedPaths: command ? [command] : [],
  };
  if (!command) return { ...base, available: false };
  const resolved = await probe.atPath(command);
  return resolved
    ? { ...base, available: true, command: resolved, source: 'configured' as const }
    : { ...base, available: false };
}

export interface DetectEditorsOptions {
  platform: EditorPlatform;
  env: NodeJS.ProcessEnv;
  probe: EditorProbe;
  /** The persisted choice, already normalized. Null when the user has none. */
  selected: ExternalEditorPrefs | null;
}

/**
 * Probe every catalogue entry (plus the user's custom editor, when they added
 * one) and assemble the `GET /api/editor/detect` body.
 *
 * `effectiveEditorId` deliberately does NOT fall back when the user's explicit
 * choice is missing: launching an editor the user did not pick is worse than
 * reporting that the one they picked is gone. Auto-selection by
 * `EXTERNAL_EDITOR_AUTO_PREFERENCE` only applies when no choice is stored.
 */
export async function detectEditors(options: DetectEditorsOptions): Promise<EditorDetectResponse> {
  const { platform, env, probe, selected } = options;
  const editors: DetectedEditor[] = [];
  if (platform !== 'unknown') {
    for (const entry of EDITOR_CATALOGUE) {
      editors.push(await resolveEntry(entry, platform, env, probe));
    }
  }
  if (selected?.id === 'custom') {
    editors.push(await resolveCustomEntry(selected, probe));
  }

  const byId = new Map<ExternalEditorId, DetectedEditor>(
    editors.map((editor) => [editor.id, editor] as const),
  );
  const selectedEditorId = selected ? (selected.id as ExternalEditorId) : null;
  const selectedEditor = selectedEditorId ? byId.get(selectedEditorId) : undefined;

  let effectiveEditorId: ExternalEditorId | null = null;
  if (selectedEditorId) {
    effectiveEditorId = selectedEditor?.available ? selectedEditorId : null;
  } else {
    for (const candidate of EXTERNAL_EDITOR_AUTO_PREFERENCE) {
      if (byId.get(candidate)?.available) {
        effectiveEditorId = candidate;
        break;
      }
    }
  }

  const vscodeAvailable = VS_CODE_EDITOR_IDS.some((id) => byId.get(id)?.available === true);

  return {
    platform,
    editors,
    selectedEditorId,
    effectiveEditorId,
    vscodeAvailable,
    vscodeDownloadUrl: VS_CODE_DOWNLOAD,
  };
}

/** Thrown when a requested target cannot be turned into a safe argument vector. */
export class EditorArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EditorArgumentError';
  }
}

/**
 * Validate one path destined for the editor's argument vector.
 *
 * Shell metacharacters are NOT filtered here, and do not need to be: the spawn
 * never goes through a shell, so `&`, `|`, `` ` `` and `$(…)` are ordinary
 * bytes in a filename. What is rejected is what could still change meaning at
 * the argv layer — a NUL byte (which truncates the argument), and anything
 * that is not an absolute normalized path (a relative path would be resolved
 * against the daemon's working directory, and a leading `-` would be read by
 * the editor CLI as an option rather than a file).
 */
export function assertEditorPathArg(
  value: unknown,
  label: string,
  pathApi: EditorPathApi = nodePath,
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new EditorArgumentError(`${label} must be a non-empty path`);
  }
  if (value.includes('\0')) {
    throw new EditorArgumentError(`${label} must not contain a NUL byte`);
  }
  const normalized = pathApi.normalize(value);
  if (!pathApi.isAbsolute(normalized)) {
    throw new EditorArgumentError(`${label} must be an absolute path, got: ${value}`);
  }
  // Defence in depth behind the absoluteness rule above: a normalized absolute
  // path can never start with `-`, so this only fires if that rule is ever
  // loosened. An argument the CLI reads as an option is the argv-level
  // equivalent of a shell metacharacter, and this is where it stops.
  if (normalized.startsWith('-')) {
    throw new EditorArgumentError(`${label} must not look like a command-line option`);
  }
  return normalized;
}

export interface EditorLaunchTarget {
  /** Absolute directory to open as the workspace root. */
  folder?: string;
  /** Absolute file to open inside it. */
  file?: string;
}

/**
 * Build the argument vector for an editor launch.
 *
 * Every catalogue entry takes plain positional paths — `<editor> <folder>`
 * opens the folder as a workspace root, and `<editor> <folder> <file>` opens
 * the file inside that root — so one builder covers them all. The folder comes
 * first precisely so the window has a project to sit in; passing the file
 * alone is the "single file with no context" failure this feature exists to
 * avoid.
 */
export function buildEditorLaunchArgs(
  editor: { id: ExternalEditorId; label: string; supportsFolders: boolean },
  target: EditorLaunchTarget,
  pathApi: EditorPathApi = nodePath,
): string[] {
  const args: string[] = [];
  if (target.folder !== undefined) {
    if (!editor.supportsFolders) {
      throw new EditorArgumentError(
        `${editor.label} cannot open a folder as a workspace root`,
      );
    }
    args.push(assertEditorPathArg(target.folder, 'folder', pathApi));
  }
  if (target.file !== undefined) {
    args.push(assertEditorPathArg(target.file, 'file', pathApi));
  }
  if (args.length === 0) {
    throw new EditorArgumentError('nothing to open: a folder or a file is required');
  }
  return args;
}
