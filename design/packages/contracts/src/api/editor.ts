// Shared DTOs for the "open in external editor" capability.
//
// Both surfaces speak this shape: the web UI's "Open in…" affordance and the
// `od editor …` CLI call the same two daemon routes — `GET /api/editor/detect`
// and `POST /api/editor/open`. Keep this file pure TypeScript — no Node, DOM,
// or runtime deps — per the contracts boundary.
//
// Visual Studio Code is the entry that must always work, so it gets the widest
// probe: the `$PATH` shim, the per-user and machine install locations, the
// Insiders build, and a portable checkout. Detection REPORTS what it looked at
// (`probedCommands` / `probedPaths`) rather than asserting a bare "not
// installed", and a miss answers with {@link VS_CODE_DOWNLOAD_URL} so the
// client can offer the install instead of failing blind or quietly launching
// something the user did not pick.
//
// Distinct from `host-tools.ts`: that surface is the "reveal this project in
// any local app" hand-off (Finder, Terminal, Warp, …) keyed to a project id.
// This one is the editor hand-off proper — it carries a persisted choice, it
// opens a folder AS A WORKSPACE ROOT, and it accepts an arbitrary absolute
// path so an exported file can be opened in one action.

/**
 * Editors the daemon knows how to detect and launch. `custom` is the
 * user-added executable stored in app config; every other id is a catalogue
 * entry with its own probe locations.
 */
export const EXTERNAL_EDITOR_IDS = [
  'vscode',
  'vscode-insiders',
  'cursor',
  'windsurf',
  'zed',
  'sublime',
  'webstorm',
  'idea',
  'custom',
] as const;

export type ExternalEditorId = (typeof EXTERNAL_EDITOR_IDS)[number];

/** The two entries that satisfy "VS Code must always work". */
export const VS_CODE_EDITOR_IDS = ['vscode', 'vscode-insiders'] as const;

/**
 * Order the daemon auto-picks in when the user has NOT chosen an editor.
 * VS Code first, by policy. An explicit choice is never overridden by this —
 * a missing selected editor reports itself missing rather than silently
 * falling through to the next entry.
 */
export const EXTERNAL_EDITOR_AUTO_PREFERENCE = [
  'vscode',
  'vscode-insiders',
  'cursor',
  'windsurf',
  'zed',
  'sublime',
  'webstorm',
  'idea',
] as const;

/** Offered verbatim whenever no VS Code install resolved. */
export const VS_CODE_DOWNLOAD_URL = 'https://code.visualstudio.com/Download';

export type EditorPlatform = 'darwin' | 'win32' | 'linux' | 'unknown';

/**
 * Where a resolved executable came from, in precedence order:
 * - `env`        — an `OD_*_BIN` override pinned it explicitly.
 * - `configured` — the user added this executable themselves (`custom`).
 * - `path`       — a shim on `$PATH`, which is what the user's own shell uses.
 * - `portable`   — a portable checkout located through `VSCODE_PORTABLE`.
 * - `well-known` — a per-user or machine install location.
 */
export const EDITOR_DETECTION_SOURCES = [
  'env',
  'configured',
  'path',
  'portable',
  'well-known',
] as const;

export type EditorDetectionSource = (typeof EDITOR_DETECTION_SOURCES)[number];

export interface DetectedEditor {
  id: ExternalEditorId;
  label: string;
  available: boolean;
  /** Absolute executable that resolved. Absent when `available` is false. */
  command?: string;
  /** Which probe found it. Absent when `available` is false. */
  source?: EditorDetectionSource;
  /**
   * True when passing a directory opens it as the window's workspace root, so
   * the file tree is usable. An editor that cannot do that is reported here
   * rather than silently downgraded to "open the file with no context".
   */
  supportsFolders: boolean;
  /** Vendor download page, so a miss can offer the install. */
  downloadUrl: string;
  /** `$PATH` names that were probed, in preference order. */
  probedCommands: string[];
  /** Absolute locations that were probed, in preference order. */
  probedPaths: string[];
}

/** Response body for `GET /api/editor/detect`. */
export interface EditorDetectResponse {
  platform: EditorPlatform;
  editors: DetectedEditor[];
  /** Persisted choice from app config; null when the user has not chosen one. */
  selectedEditorId: ExternalEditorId | null;
  /**
   * What `POST /api/editor/open` would actually use right now. Null when
   * nothing resolved — including the case where the user's explicit choice is
   * installed no longer, which never silently falls back to another editor.
   */
  effectiveEditorId: ExternalEditorId | null;
  /** True when VS Code stable or Insiders resolved on this host. */
  vscodeAvailable: boolean;
  /** Always populated; the client shows it when `vscodeAvailable` is false. */
  vscodeDownloadUrl: string;
}

/**
 * Request body for `POST /api/editor/open`.
 *
 * At least one of `projectId`, `folder`, `file`, or `path` is required. Every
 * path field must be ABSOLUTE — the daemon never resolves a caller-supplied
 * path against its own working directory, and an absolute path can never be
 * misread as a command-line option by the editor CLI.
 */
export interface EditorOpenRequest {
  /** Project whose resolved directory becomes the workspace root. */
  projectId?: string;
  /** Explicit absolute workspace root. Wins over `projectId`. */
  folder?: string;
  /** Absolute file to open inside the workspace root. */
  file?: string;
  /** Convenience: an absolute folder or file, classified by the daemon. */
  path?: string;
  /**
   * When only a file is known, also open its containing directory as the
   * workspace root so the file tree is usable. Defaults to true — this is what
   * makes "open this export in VS Code" a single useful action rather than a
   * lone file in an empty window.
   */
  openWorkspaceRoot?: boolean;
  /** Override the persisted choice for this call only. */
  editorId?: ExternalEditorId;
}

/** Response body for a successful `POST /api/editor/open`. */
export interface EditorOpenResponse {
  ok: true;
  editorId: ExternalEditorId;
  label: string;
  /** Absolute executable that was spawned. */
  command: string;
  /**
   * The exact argument vector handed to the process. No shell was involved, so
   * every element is inert data; echoing it back lets a caller verify that.
   */
  args: string[];
  /** Workspace root that was opened, when one resolved. */
  folder?: string;
  /** File that was opened inside it, when one was requested. */
  file?: string;
}

/**
 * `details` payload on the 409 `EDITOR_NOT_FOUND` error, so a client can offer
 * the install and show what was actually looked at.
 */
export interface EditorNotFoundDetails {
  kind: 'editor-not-found';
  /** The editor that was asked for, when the caller or config named one. */
  editorId?: ExternalEditorId;
  downloadUrl: string;
  probedCommands: string[];
  probedPaths: string[];
}

export function isExternalEditorId(value: unknown): value is ExternalEditorId {
  return typeof value === 'string' && (EXTERNAL_EDITOR_IDS as readonly string[]).includes(value);
}

export function isVsCodeEditorId(value: unknown): value is 'vscode' | 'vscode-insiders' {
  return typeof value === 'string' && (VS_CODE_EDITOR_IDS as readonly string[]).includes(value);
}
